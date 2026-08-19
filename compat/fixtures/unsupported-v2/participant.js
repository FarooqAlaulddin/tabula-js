const FIXTURE = Object.freeze({
	id: 'synthetic-unsupported-v2',
	protocol: { major: 2, revision: 0, minRevision: 0 },
	tabId: 'fixture-v2-tab',
	instanceId: 'fixture-v2-instance',
})

export function start(namespace) {
	const channel = new BroadcastChannel(`tabula:${namespace}`)
	const observedTypes = []
	let sequence = 0
	channel.onmessage = ({ data }) => {
		if (data?.from?.instanceId !== FIXTURE.instanceId) observedTypes.push(data?.type)
	}
	const send = (type, payload) => {
		channel.postMessage({
			protocol: FIXTURE.protocol,
			type,
			id: `${FIXTURE.instanceId}:${++sequence}`,
			from: { tabId: FIXTURE.tabId, instanceId: FIXTURE.instanceId },
			sentAt: Date.now(),
			payload,
		})
	}
	return {
		identity: FIXTURE,
		blast() {
			send('state:set', { key: 'unsafe', value: 'future' })
			send('state:set', { key: 'unsafe', value: 'future-again' })
			send('view:claimed', { name: 'future-view', tabId: FIXTURE.tabId })
		},
		snapshot: () => ({ observedTypes: [...observedTypes] }),
		stop: () => channel.close(),
	}
}
