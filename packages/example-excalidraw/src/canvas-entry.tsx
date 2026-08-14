import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { SharedCanvas } from './SharedCanvas'
import { workspace } from './workspace'
import './style.css'

const subscribeTheme = (onStoreChange: () => void) => workspace.state.on('theme', onStoreChange)
const getTheme = () => workspace.state.get('theme') ?? 'light'

function CanvasPage() {
	const [tabs, setTabs] = useState(() => workspace.tabs.list())
	const [view, setView] = useState(() => workspace.tabs.current().view)
	const [editable, setEditable] = useState(false)
	const currentTheme = useSyncExternalStore(subscribeTheme, getTheme)

	useEffect(() => {
		void workspace.claim('canvas').then((result) => setEditable(result.status === 'claimed'))
		const refreshTabs = () => setTabs(workspace.tabs.list())
		const refreshView = () => setView(workspace.tabs.current().view)
		const unsubscribeJoin = workspace.on('tab:join', refreshTabs)
		const unsubscribeLeave = workspace.on('tab:leave', refreshTabs)
		const unsubscribeClaimed = workspace.on('view:claimed', refreshView)
		const unsubscribeVacant = workspace.on('view:vacant', refreshView)

		refreshTabs()
		refreshView()

		return () => {
			unsubscribeJoin()
			unsubscribeLeave()
			unsubscribeClaimed()
			unsubscribeVacant()
		}
	}, [])

	return (
		<div className="canvas-fullscreen" data-theme={currentTheme}>
			<div className="canvas-topbar">
				<span className="canvas-topbar-text">
					{editable ? 'Exclusive canvas editor' : 'Read-only: canvas already claimed'} —{' '}
					{tabs.length} tab{tabs.length !== 1 ? 's' : ''}
				</span>
				{view && (
					<span className="canvas-topbar-view">
						view: <strong>{view}</strong>
					</span>
				)}
			</div>
			<div className="canvas-body">
				<SharedCanvas editable={editable} />
			</div>
		</div>
	)
}

// biome-ignore lint/style/noNonNullAssertion: root element always exists
createRoot(document.getElementById('root')!).render(<CanvasPage />)
