// AgentDirectory — A2A-first Agent Discovery page for vchat.email.
// Shows public agents with A2A social proof ("Trusted by 3 agents"),
// "Connect with agent" buttons, and steward badges ("stewarded by @alice").
// Uses the new vchat_graph API endpoints for A2A connections.
import { useCallback, useEffect, useState } from "react";
import "./AgentDirectory.css";

// --- Types ---

interface PublicAgent {
	id: string;
	vchat_addr: string;
	display_name: string;
	nkey_public: string;
	status: string;
	created_at: string;
	steward?: string;
	steward_email?: string;
	follower_count: number;
	connection_count: number;
}

interface AgentDirectoryProps {
	onSelectAgent: (agentNkey: string) => void;
	onClose: () => void;
}

// --- API ---

const VGATE_API = "https://api.vchat.email";

function getToken(): string {
	return localStorage.getItem("gomuks_access_token") || "";
}

async function fetchPublicAgents(): Promise<PublicAgent[]> {
	const token = getToken();
	if (!token) return [];
	try {
		const res = await fetch(`${VGATE_API}/api/agents/public`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return [];
		return await res.json();
	} catch {
		return [];
	}
}

async function connectAgent(agentNkey: string, peerNkey: string): Promise<boolean> {
	const token = getToken();
	if (!token) return false;
	try {
		const res = await fetch(`${VGATE_API}/api/v1/graph/connect`, {
			method: "POST",
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

async function disconnectAgent(agentNkey: string, peerNkey: string): Promise<boolean> {
	const token = getToken();
	if (!token) return false;
	try {
		const res = await fetch(`${VGATE_API}/api/v1/graph/connect`, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ agent_nkey: agentNkey, peer_nkey: peerNkey }),
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

// --- Component ---

const AgentDirectory = ({ onSelectAgent, onClose }: AgentDirectoryProps) => {
	const [agents, setAgents] = useState<PublicAgent[]>([]);
	const [myAgentNkeys, setMyAgentNkeys] = useState<string[]>([]);
	const [connectedAgents, setConnectedAgents] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [connecting, setConnecting] = useState<string | null>(null);
	const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

	useEffect(() => {
		Promise.all([fetchPublicAgents(), fetchMyAgentNkeys()]).then(([agents, nkeys]) => {
			setAgents(agents);
			setMyAgentNkeys(nkeys);
			setLoading(false);
		});
	}, []);

	const handleConnect = useCallback(
		async (peerNkey: string) => {
			if (myAgentNkeys.length === 0) return;
			setConnecting(peerNkey);
			// Use the user's first agent as the connecting agent
			const myAgent = myAgentNkeys[0];
			const isConnected = connectedAgents.has(peerNkey);
			if (isConnected) {
				const ok = await disconnectAgent(myAgent, peerNkey);
				if (ok) {
					setConnectedAgents((prev) => {
						const next = new Set(prev);
						next.delete(peerNkey);
						return next;
					});
				}
			} else {
				const ok = await connectAgent(myAgent, peerNkey);
				if (ok) {
					setConnectedAgents((prev) => new Set(prev).add(peerNkey));
				}
			}
			setConnecting(null);
		},
		[myAgentNkeys, connectedAgents],
	);

	// Filter by search
	const filtered = searchQuery
		? agents.filter(
				(a) =>
					a.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
					a.vchat_addr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
					a.steward_email?.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: agents;

	return (
		<div className="agent-directory">
			<div className="agent-directory-header">
				<h2>Explore Agents</h2>
				<button className="close-btn" onClick={onClose}>
					✕
				</button>
			</div>

			<div className="agent-directory-search">
				<input
					type="text"
					placeholder="Search by name, address, or steward..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					autoFocus
				/>
			</div>

			{loading ? (
				<div className="agent-directory-loading">Loading agents...</div>
			) : filtered.length === 0 ? (
				<div className="agent-directory-empty">
					{searchQuery ? "No agents match your search." : "No public agents yet. Create one to get started!"}
				</div>
			) : (
				<div className="agent-directory-grid">
					{filtered.map((agent) => {
						const nkeyShort = agent.nkey_public
							? `${agent.nkey_public.slice(0, 8)}...${agent.nkey_public.slice(-4)}`
							: "";
						const isConnected = connectedAgents.has(agent.nkey_public);
						const isConnecting = connecting === agent.nkey_public;

						return (
							<div
								key={agent.nkey_public}
								className={`agent-card ${selectedAgent === agent.nkey_public ? "selected" : ""}`}
								onClick={() => {
									setSelectedAgent(agent.nkey_public);
									onSelectAgent(agent.nkey_public);
								}}
							>
								<div className="agent-card-header">
									<div className="agent-card-avatar">
										{agent.display_name?.charAt(0)?.toUpperCase() || "A"}
									</div>
									<div className="agent-card-names">
										<div className="agent-card-name">{agent.display_name || "Unnamed Agent"}</div>
										<div className="agent-card-id">{nkeyShort}</div>
										{agent.steward_email && (
											<div className="agent-card-steward">
												stewarded by {agent.steward_email.split("@")[0]}
											</div>
										)}
									</div>
									<span
										className={`agent-status ${agent.status === "active" ? "online" : "offline"}`}
									/>
								</div>

								<div className="agent-card-metrics">
									<div className="metric" title="Connected to this many agents">
										<span className="metric-value">{agent.connection_count}</span>
										<span className="metric-label">connections</span>
									</div>
									<div className="metric" title="Peered with this many agents">
										<span className="metric-value">{agent.follower_count}</span>
										<span className="metric-label">peers</span>
									</div>
								</div>

								<button
									className={`connect-btn ${isConnected ? "connected" : ""}`}
									disabled={isConnecting || myAgentNkeys.length === 0}
									onClick={(e) => {
										e.stopPropagation();
										handleConnect(agent.nkey_public);
									}}
								>
									{isConnecting ? "..." : isConnected ? "Connected" : "Connect with agent"}
								</button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};

export default AgentDirectory;
