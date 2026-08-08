import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { SharedCanvas } from './SharedCanvas'
import { workspace } from './workspace'
import './style.css'

const subscribeTheme = (onStoreChange: () => void) => workspace.state.on('theme', onStoreChange)
const getTheme = () => workspace.state.get('theme') ?? 'light'

function Dashboard() {
	const [tabs, setTabs] = useState(() => workspace.tabs.list())
	const [isLeader, setIsLeader] = useState(() => workspace.isLeader())
	const [view, setView] = useState(() => workspace.tabs.current().view)
	const currentTheme = useSyncExternalStore(subscribeTheme, getTheme)
	const currentId = workspace.tabs.current().id

	useEffect(() => {
		const refreshTabs = () => setTabs(workspace.tabs.list())
		const refreshView = () => setView(workspace.tabs.current().view)
		const unsubscribeJoin = workspace.on('tab:join', refreshTabs)
		const unsubscribeLeave = workspace.on('tab:leave', refreshTabs)
		const unsubscribeLeader = workspace.on('leader:change', ({ isMe }) => setIsLeader(isMe))
		const unsubscribeClaimed = workspace.on('view:claimed', refreshView)
		const unsubscribeVacant = workspace.on('view:vacant', refreshView)

		refreshTabs()
		refreshView()
		setIsLeader(workspace.isLeader())

		return () => {
			unsubscribeJoin()
			unsubscribeLeave()
			unsubscribeLeader()
			unsubscribeClaimed()
			unsubscribeVacant()
		}
	}, [])

	const toggleTheme = () => {
		workspace.state.set('theme', currentTheme === 'light' ? 'dark' : 'light')
	}

	const expandCanvas = () => {
		workspace.open('canvas', {
			url: '/canvas.html',
			syncKeys: ['elements', 'theme'],
		})
	}

	return (
		<div className="dashboard" data-theme={currentTheme}>
			<header className="header">
				<h1 className="logo">Excalidraw + Tabula</h1>
				<span className="tag">zero changes to Excalidraw</span>
				<div className="header-actions">
					<button className="btn" onClick={toggleTheme} type="button">
						{currentTheme === 'light' ? 'Dark' : 'Light'}
					</button>
					<button className="btn btn-primary" onClick={expandCanvas} type="button">
						Expand to Tab
					</button>
				</div>
			</header>

			<aside className="sidebar">
				<div className="sidebar-section">
					<h3>Connected Tabs</h3>
					<ul className="tab-list">
						{tabs.map((tab) => (
							<li key={tab.id} className="tab-item">
								<span className={`tab-dot ${tab.visible ? 'visible' : ''}`} />
								<span className="tab-id">{tab.id.slice(0, 8)}</span>
								{tab.id === currentId && <span className="badge">you</span>}
								{isLeader && tab.id === currentId && (
									<span className="badge badge-leader">leader</span>
								)}
								{tab.view && <span className="badge badge-view">{tab.view}</span>}
							</li>
						))}
					</ul>
				</div>

				<div className="sidebar-section">
					<h3>Core APIs</h3>
					<ul className="hooks-list">
						<li>
							<code>state.on/get/set</code> — theme toggle
						</li>
						<li>
							<code>tabs.list</code> — tab list
						</li>
						<li>
							<code>leader:change</code> — leader badge
						</li>
						<li>
							<code>tabs.current</code> — {view ? `"${view}"` : 'no view'}
						</li>
					</ul>
				</div>

				<div className="sidebar-section">
					<h3>How it works</h3>
					<p className="sidebar-text">
						The Excalidraw component is used <strong>as-is</strong> — no modifications. The app
						subscribes directly to the Tabula workspace and passes data as ordinary props.
					</p>
					<p className="sidebar-text">
						Click <strong>Expand to Tab</strong> to open a full-screen canvas. Draw in either tab —
						changes sync instantly.
					</p>
				</div>
			</aside>

			<main className="canvas-area">
				<SharedCanvas />
			</main>
		</div>
	)
}

// biome-ignore lint/style/noNonNullAssertion: root element always exists
createRoot(document.getElementById('root')!).render(<Dashboard />)
