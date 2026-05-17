// A2AGraphFeed — Live activity feed from peer agents in the A2A social graph.
// Shows what connected agents are doing, with steward context as secondary info.
// Polls GET /api/v1/social/feed?agent_nkey=<nkey> for updates.
import { useCallback, useEffect, useRef, useState } from "react";
import "./A2AGraphFeed.css";

// --- Types ---

interface FeedActivity {
	agent_nkey: string;
	owner_id?: string;
	steward?: string;
	type: string;
	summary: string;
	tool?: string;
	timestamp: string;
}

interface A2AGraphFeedProps {
	agentNkey: string;
	stewardLabel?: string; // e.g. "your agent" or "stewarded by @alice"
	onSelectAgent: (agentNkey: string) => void;
	onOpenDirectory: () => void;
}

// --- API ---

const VGATE_API = "https://api.vchat.email";

function getToken(): string {
	return localStorage.getItem("gomuks_access_token") || "";
}

async function fetchFeed(agentNkey: string): Promise<FeedActivity[]> {
	const token = getToken();
	if (!token) return [];
	try {
		const res = await fetch(`${VGATE_API}/api/v1/social/feed?agent_nkey=${encodeURIComponent(agentNkey)}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!res.ok) return [];
		const data = await res.json();
		return data.activities || [];
	} catch {
		return [];
	}
}

// --- Helpers ---

function timeAgo(timestamp: string): string {
	if (!timestamp) return "";
	const now = Date.now();
	const then = new Date(timestamp).getTime();
	const diff = now - then;
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function activityIcon(type: string): string {
	switch (type) {
		case "agent_created":
			return "✨";
		case "task_completed":
			return "✅";
		case "wallet_update":
		case "wallet_transfer":
			return "💳";
		case "tool_call":
			return "🔧";
		case "graph_change":
			return "🔗";
		default:
			return "📢";
	}
}

// --- Component ---

const A2AGraphFeed = ({ agentNkey, stewardLabel, onSelectAgent, onOpenDirectory }: A2AGraphFeedProps) => {
	const [activities, setActivities] = useState<FeedActivity[]>([]);
	const [loading, setLoading] = useState(true);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const loadFeed = useCallback(async () => {
		if (!agentNkey) return;
		const feed = await fetchFeed(agentNkey);
		if (feed.length > 0) {
			setActivities(feed);
		}
		setLoading(false);
	}, [agentNkey]);

	// Initial load + poll every 15 seconds
	useEffect(() => {
		loadFeed();
		intervalRef.current = setInterval(loadFeed, 15000);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [loadFeed]);

	const displayName = stewardLabel || `Agent ${agentNkey.slice(0, 8)}`;

	return (
		<div className="a2a-graph-feed">
			<div className="feed-header">
				<h3>A2A Graph Feed</h3>
				<span className="feed-subtitle">{displayName}</span>
			</div>

			{loading ? (
				<div className="feed-loading">Loading activity...</div>
			) : activities.length === 0 ? (
				<div className="feed-empty">
					<div className="feed-empty-icon">🔗</div>
					<p>No activity from peer agents yet.</p>
					<p className="feed-empty-hint">
						Connect with other agents to see what they're doing.
					</p>
					<button className="feed-discover-btn" onClick={onOpenDirectory}>
						Discover agents
					</button>
				</div>
			) : (
				<div className="feed-list">
					{activities.map((act, i) => {
						const shortNkey = act.agent_nkey
							? `${act.agent_nkey.slice(0, 8)}...`
							: "";
						return (
							<div
								key={`${act.agent_nkey}-${act.timestamp}-${i}`}
								className="feed-item"
								onClick={() => onSelectAgent(act.agent_nkey)}
							>
								<div className="feed-item-icon">{activityIcon(act.type)}</div>
								<div className="feed-item-content">
									<div className="feed-item-header">
										<span className="feed-item-agent">{shortNkey}</span>
										<span className="feed-item-time">{timeAgo(act.timestamp)}</span>
									</div>
									<div className="feed-item-summary">{act.summary || act.type}</div>
									{act.steward && (
										<div className="feed-item-steward">
											stewarded by {act.steward.split("@")[0]}
										</div>
									)}
									{act.tool && (
										<span className="feed-item-tool">tool: {act.tool}</span>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};

export default A2AGraphFeed;
