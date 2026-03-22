import { createRoot } from 'react-dom/client'
import { TabulaProvider, useLeader, useSharedState, useTabPresence, useTabView } from 'tabula-react'
import { SharedCanvas } from './SharedCanvas'
import { workspace } from './workspace'
import type { DrawingState } from './workspace'
import './style.css'

function Dashboard() {
	const tabs = useTabPresence()
	const isLeader = useLeader()
	const view = useTabView()
	const currentId = workspace.tabs.current().id

	// useSharedState: theme syncs across all tabs automatically
	const [theme, setTheme] = useSharedState<DrawingState, 'theme'>('theme')
	const currentTheme = theme ?? 'light'

	const toggleTheme = () => {
		setTheme(currentTheme === 'light' ? 'dark' : 'light')
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
					<h3>Hooks used</h3>
					<ul className="hooks-list">
						<li>
							<code>useSharedState</code> — theme toggle
						</li>
						<li>
							<code>useTabPresence</code> — tab list
						</li>
						<li>
							<code>useLeader</code> — leader badge
						</li>
						<li>
							<code>useTabView</code> — {view ? `"${view}"` : 'no view'}
						</li>
					</ul>
				</div>

				<div className="sidebar-section">
					<h3>How it works</h3>
					<p className="sidebar-text">
						The Excalidraw component is used <strong>as-is</strong> — no modifications. A thin
						Tabula wrapper syncs the drawing data across tabs via BroadcastChannel.
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
createRoot(document.getElementById('root')!).render(
	<TabulaProvider workspace={workspace}>
		<Dashboard />
	</TabulaProvider>,
)
