import { createRoot } from 'react-dom/client'
import { TabulaProvider, useSharedState, useTabPresence, useTabView } from 'tabula-react'
import { SharedCanvas } from './SharedCanvas'
import { workspace } from './workspace'
import type { DrawingState } from './workspace'
import './style.css'

// Claim the 'canvas' view — queued until workspace is ready
workspace.claim('canvas')

function CanvasPage() {
	const tabs = useTabPresence()
	const view = useTabView()

	// useSharedState: theme syncs from dashboard automatically
	const [theme] = useSharedState<DrawingState, 'theme'>('theme')
	const currentTheme = theme ?? 'light'

	return (
		<div className="canvas-fullscreen" data-theme={currentTheme}>
			<div className="canvas-topbar">
				<span className="canvas-topbar-text">
					Full-screen canvas — synced with {tabs.length} tab{tabs.length !== 1 ? 's' : ''}
				</span>
				{view && (
					<span className="canvas-topbar-view">
						view: <strong>{view}</strong>
					</span>
				)}
			</div>
			<div className="canvas-body">
				<SharedCanvas />
			</div>
		</div>
	)
}

// biome-ignore lint/style/noNonNullAssertion: root element always exists
createRoot(document.getElementById('root')!).render(
	<TabulaProvider workspace={workspace}>
		<CanvasPage />
	</TabulaProvider>,
)
