// NewAgentDialog — "New an Agent" creation dialog for vchat.email.
// Shows 3 template cards (Auditor, Researcher, Secretary) and a name input.
// Posts to api.vchat.email/api/agents on creation.
import { useCallback, useState } from "react"
import "./NewAgentDialog.css"

const VGATE_API = "https://api.vchat.email"

const TEMPLATES = [
	{
		id: "auditor",
		name: "Auditor",
		description: "Watches rooms for activity, generates digests of who owes what",
		icon: "🔍",
		initialCredits: 50,
	},
	{
		id: "researcher",
		name: "Researcher",
		description: "Hires other agents via A2A to fetch data — demonstrates wallet integration",
		icon: "📚",
		initialCredits: 100,
	},
	{
		id: "secretary",
		name: "Secretary",
		description: "Manages your agent profile and permissions across rooms",
		icon: "📋",
		initialCredits: 50,
	},
]

function getToken(): string {
	return localStorage.getItem("gomuks_access_token") || ""
}

interface NewAgentDialogProps {
	onClose: () => void
	onCreated: (agentNkey: string) => void
}

const NewAgentDialog = ({ onClose, onCreated }: NewAgentDialogProps) => {
	const [selectedTemplate, setSelectedTemplate] = useState<string>("auditor")
	const [agentName, setAgentName] = useState("")
	const [creating, setCreating] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleCreate = useCallback(async () => {
		const name = agentName.trim()
		if (!name) {
			setError("Please enter a name for your agent")
			return
		}
		setCreating(true)
		setError(null)
		try {
			const token = getToken()
			const res = await fetch(`${VGATE_API}/api/agents`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					template: selectedTemplate,
					name: name,
				}),
			})
			if (!res.ok) {
				const data = await res.json().catch(() => ({}))
				throw new Error(data.error || `HTTP ${res.status}`)
			}
			const data = await res.json()
			onCreated(data.nkey || data.vchat_address || name)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create agent")
		} finally {
			setCreating(false)
		}
	}, [agentName, selectedTemplate, onCreated])

	return (
		<div className="new-agent-dialog">
			<div className="new-agent-header">
				<h2>New an Agent</h2>
				<button className="close-btn" onClick={onClose}>✕</button>
			</div>

			<div className="new-agent-body">
				<p className="new-agent-subtitle">Choose a template to get started:</p>

				<div className="template-grid">
					{TEMPLATES.map((tpl) => (
						<button
							key={tpl.id}
							className={`template-card ${selectedTemplate === tpl.id ? "selected" : ""}`}
							onClick={() => setSelectedTemplate(tpl.id)}
						>
							<div className="template-icon">{tpl.icon}</div>
							<div className="template-info">
								<div className="template-name">{tpl.name}</div>
								<div className="template-desc">{tpl.description}</div>
							</div>
							<div className="template-credits">{tpl.initialCredits} VC</div>
						</button>
					))}
				</div>

				<div className="agent-name-input">
					<label htmlFor="agent-name">Agent Name</label>
					<input
						id="agent-name"
						type="text"
						placeholder="My Agent"
						value={agentName}
						onChange={(e) => setAgentName(e.target.value)}
						disabled={creating}
						autoFocus
					/>
				</div>

				{error && <div className="new-agent-error">{error}</div>}

				<button
					className="create-btn"
					onClick={handleCreate}
					disabled={creating || !agentName.trim()}
				>
					{creating ? "Creating..." : "New an Agent"}
				</button>
			</div>
		</div>
	)
}

export default NewAgentDialog
