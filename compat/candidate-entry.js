import { createWorkspace } from '@farooqalaulddin/tabula-js'

const namespace = new URLSearchParams(window.location.search).get('ns') ?? 'compatibility'
const workspace = createWorkspace(namespace, { heartbeat: 100, timeout: 500, readyTimeout: 700 })
const incompatible = []
const handles = new Map()

workspace.on('protocol:incompatible', (event) => incompatible.push(event))
globalThis.__candidate = {
	workspace,
	incompatible,
	ready: workspace.ready,
	set: (key, value) => workspace.state.set(key, value),
	delete: (key) => workspace.state.delete(key),
	async claim(name) {
		const result = await workspace.claim(name)
		if (result.status === 'claimed') handles.set(name, result.handle)
		return result.status
	},
}

workspace.ready.then(
	() => {
		document.getElementById('status').textContent = 'ready'
	},
	(error) => {
		document.getElementById('status').textContent = `failed: ${error.message}`
	},
)
