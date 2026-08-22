import { createWorkspace } from '@thinkly/tabula-js'

export function start(namespace) {
	const workspace = createWorkspace(namespace, { heartbeat: 100, timeout: 500, readyTimeout: 700 })
	const handles = new Map()

	return {
		ready: workspace.ready,
		current: () => workspace.tabs.current().id,
		tabs: () => workspace.tabs.list().map((tab) => tab.id),
		leader: () => workspace.tabs.leader()?.id ?? null,
		get: (key) => workspace.state.get(key),
		set: (key, value) => workspace.state.set(key, value),
		delete: (key) => workspace.state.delete(key),
		view: (name) => workspace.views.get(name)?.id ?? null,
		async claim(name) {
			const result = await workspace.claim(name)
			if (result.status === 'claimed') handles.set(name, result.handle)
			return result.status
		},
		destroy: () => workspace.destroy(),
	}
}
