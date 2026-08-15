const query = new URLSearchParams(window.location.search)
const fixture = query.get('fixture') ?? 'v1-rev0'
const namespace = query.get('ns') ?? 'compatibility'
const fixtureUrl = new URL(`fixtures/${fixture}/participant.js`, document.baseURI)
import(/* @vite-ignore */ fixtureUrl.href).then(
	(participant) => {
		globalThis.__fixture = participant.start(namespace)
		document.getElementById('status').textContent = 'ready'
	},
	(error) => {
		document.getElementById('status').textContent = `failed: ${error.message}`
	},
)
