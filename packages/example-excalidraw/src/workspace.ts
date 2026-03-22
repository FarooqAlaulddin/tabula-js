import { createWorkspace } from 'tabula'

export interface DrawingState {
	elements: unknown[]
	theme: 'light' | 'dark'
}

export const workspace = createWorkspace<DrawingState>('excalidraw-tabula', {
	heartbeat: 1500,
	timeout: 5000,
})
