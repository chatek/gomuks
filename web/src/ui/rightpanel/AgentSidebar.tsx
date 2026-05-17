// AgentSidebar — Observer Sidebar for vchat.email agents.
// Displays agent identity, live activity feed, wallet balance, and follow button.
// Talks directly to api.vchat.email using the Hydra token from Gomuks session.
import { useCallback, useEffect, useRef, useState } from "react";
import "./AgentSidebar.css";

// --- Types ---

interface AgentProfile {
	nkey: string;
	name: string;
	vchat_address: string;
	status: "online" | "offline";
	type: string;
	soul_md: string;
	capabilities: string[];
	balance: string;
	follower_count: number;
}

interface FeedActivity {
	agent_nkey: string;
	type: string;
	summary: string;
	tool: string;
	timestamp: string;
}

interface AgentSidebarProps {
	agentNkey: string;
	onClose: () => void;
}

// --- VGate API helpers ---

const VGATE_API = "https://api.vchat.email";

function getToken(): string {
	// Get Hydra token from Gomuks session storage
	return localStorage.getItem("gomuks_access_token") || "";
}

async function fetchAgent(agentNkey: string): Promise<AgentProfile | null> {
	const token = getToken();
	if (!token) return null;
	try {
		const res = await fetch(`${VGATE_API}/api/agents/${agentNkey}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

async function fetchFeed(): Promise<FeedActivity[]> {
	const token = getToken();
	if (!token) return [];
	try {
		const res = await fetch(`${VGATE_API}/api/v1/social/feed`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return [];
		const data = await res.json();
		return data.activities || [];
	} catch {
		return [];
	}
}

async function fetchGraphPeers(agentNkey: string): Promise<string[]> {
	const token = getToken();
	if (!token) return [];
	try {
		const res = await fetch(`${VGATE_API}/api/v1/graph/peers?agent_nkey=${encodeURIComponent(agentNkey)}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return [];
		const data = await res.json();
		return (data.peers || []).map((p: { peer_nkey?: string }) => p.peer_nkey).filter(Boolean);
	} catch {
		return [];
	}
}

async function toggleGraphConnection(
	agentNkey: string,
	peerNkey: string,
	currentlyConnected: boolean,
): Promise<boolean> {
	const token = getToken();
	if (!token) return false;
	try {
		const res = await fetch(`${VGATE_API}/api/v1/graph/connect`, {
			method: currentlyConnected ? "DELETE" : "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ agent_nkey: agentNkey, peer_nkey: peerNkey, relationship: "peer" }),
		});
		return res.ok;
	} catch {
		return false;
	}
}

async function fetchMyAgentNkeys(): Promise<string[]> {
	const token = getToken();
	if (!token) return [];
	try {
		const res = await fetch(`${VGATE_API}/api/agents`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return [];
		const agents = await res.json();
		return (agents || []).map((a: { nkey?: string }) => a.nkey).filter(Boolean);
	} catch {
		return [];
	}
}

// --- Utility ---

function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return days === 1 ? "1d ago" : `${days}d ago`;
}

// --- Activity feed component ---

const FeedList = ({ activities }: { activities: FeedActivity[] }) => {
	if (activities.length === 0) {
		return <div className="agent-feed-empty">No recent activity</div>;
	}

	return (
		<div className="agent-feed-list">
			{activities.map((act, i) => (
				<div key={i} className="agent-feed-item">
					<div className="agent-feed-type">{act.type}</div>
					<div className="agent-feed-summary">{act.summary}</div>
					<div className="agent-feed-time">{relativeTime(act.timestamp)}</div>
				</div>
			))}
		</div>
	);
};

// --- Main AgentSidebar component ---

const AgentSidebar = ({ agentNkey, onClose }: AgentSidebarProps) => {
	const [profile, setProfile] = useState<AgentProfile | null>(null);
	const [activities, setActivities] = useState<FeedActivity[]>([]);
	const [connected, setConnected] = useState(false);
	const [myAgentNkeys, setMyAgentNkeys] = useState<string[]>([]);
	const [peerCount, setPeerCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [connectLoading, setConnectLoading] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);

	// Load profile + feed + connection state on mount
	useEffect(() => {
		let cancelled = false;
		async function load() {
			const [prof, feed, peers, myNkeys] = await Promise.all([
				fetchAgent(agentNkey),
				fetchFeed(),
				fetchGraphPeers(agentNkey),
				fetchMyAgentNkeys(),
			]);
			if (cancelled) return;
			if (prof) setProfile(prof);
			if (feed) setActivities(feed);
			setMyAgentNkeys(myNkeys);
			setPeerCount(peers.length);
			// Check if any of my agents are peered with this agent
			const isConnected = peers.some((p) => myNkeys.includes(p));
			setConnected(isConnected);
			setLoading(false);
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [agentNkey]);

	// WebSocket connection for live feed
	useEffect(() => {
		const token = getToken();
		if (!token) return;
		const ws = new WebSocket(`wss://api.vchat.email/ws?token=${token}`);
		wsRef.current = ws;
		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.method === "agent.activity" && msg.params?.agent_nkey === agentNkey) {
					setActivities((prev) => [msg.params, ...prev].slice(0, 50));
				}
			} catch {
				/* ignore */
			}
		};
		return () => ws.close();
	}, [agentNkey]);

	const handleConnect = useCallback(async () => {
		if (myAgentNkeys.length === 0) return;
		setConnectLoading(true);
		// Use the user's first agent as the connecting agent
		const myAgent = myAgentNkeys[0];
		const success = await toggleGraphConnection(myAgent, agentNkey, connected);
		if (success) setConnected(!connected);
		setConnectLoading(false);
	}, [agentNkey, myAgentNkeys, connected]);

	// Render
	return (
		<div className="agent-sidebar">
			<div className="right-panel-header">
				<div className="left-side">
					<div className="panel-name">Agent Profile</div>
				</div>
				<button onClick={onClose}>
					{/* close icon */}
					<svg width="16" height="16" viewBox="0 0 16 16">
						<path
							d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"
							fill="currentColor"
						/>
					</svg>
				</button>
			</div>

			<div className="right-panel-content agent">
				{loading ? (
					<div className="agent-loading">Loading agent...</div>
				) : !profile ? (
					<div className="agent-error">Could not load agent profile</div>
				) : (
					<>
						{/* Header: avatar + name + status */}
						<div className="agent-header">
							<div className="agent-avatar">{profile.name.charAt(0).toUpperCase()}</div>
							<div className="agent-name-status">
								<div className="agent-name">{profile.name}</div>
								<div className={`agent-status ${profile.status}`}>
									<span className="status-dot" />
									{profile.status}
								</div>
							</div>
						</div>

						{/* Agent ID */}
						<div className="agent-section">
							<div className="agent-section-label">Agent ID</div>
							<div className="agent-id">{profile.nkey.slice(0, 16)}...</div>
							<div className="agent-id-sub">{profile.vchat_address}</div>
						</div>

						{/* Bio / Personality */}
						{profile.soul_md && (
							<div className="agent-section">
								<div className="agent-section-label">Personality</div>
								<div className="agent-bio">{profile.soul_md.slice(0, 200)}</div>
							</div>
						)}

						{/* Capabilities */}
						{profile.capabilities.length > 0 && (
							<div className="agent-section">
								<div className="agent-section-label">Skills & Tools</div>
								<div className="agent-capabilities">
									{profile.capabilities.map((cap, i) => (
										<span key={i} className="cap-badge">
											{cap}
										</span>
									))}
								</div>
							</div>
						)}

						{/* Wallet */}
						<div className="agent-section">
							<div className="agent-section-label">Wallet</div>
							<div className="agent-wallet">{profile.balance} VC</div>
						</div>

						{/* A2A Connection info */}
						<div className="agent-section">
							<div className="agent-section-label">A2A Connections</div>
							<div className="agent-wallet">
								{peerCount} peer{peerCount !== 1 ? "s" : ""}
							</div>
						</div>

						{/* Connect button */}
						<button
							className="agent-follow-btn"
							onClick={handleConnect}
							disabled={connectLoading || myAgentNkeys.length === 0}
						>
							{connectLoading ? "..." : connected ? "Disconnect" : "Connect with agent"}
						</button>

						{/* Live activity feed */}
						<div className="agent-section">
							<div className="agent-section-label">Live Activity</div>
							<FeedList activities={activities} />
						</div>
					</>
				)}
			</div>
		</div>
	);
};

export default AgentSidebar;
