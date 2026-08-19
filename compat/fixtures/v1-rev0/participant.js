const FIXTURE = Object.freeze({
	id: 'synthetic-v1-rev0',
	protocol: { major: 1, revision: 0 },
	tabId: 'fixture-v1-tab',
	instanceId: 'fixture-v1-instance',
})

export function start(namespace) {
	const channel = new BroadcastChannel(`tabula:${namespace}`)
	const state = Object.create(null)
	const observedTypes = []
	let sequence = 0
	const send = (type, payload, to) => {
		channel.postMessage({
			protocol: FIXTURE.protocol,
			type,
			id: `${FIXTURE.instanceId}:${++sequence}`,
			from: { tabId: FIXTURE.tabId, instanceId: FIXTURE.instanceId },
			...(to ? { to } : {}),
			sentAt: Date.now(),
			payload,
		})
	}
	const writePresence = () => {
		localStorage.setItem(
			`tabula:${namespace}:tab:${FIXTURE.tabId}`,
			JSON.stringify({ lastSeen: Date.now(), createdAt: Date.now(), visible: true, view: null }),
		)
	}

	channel.onmessage = ({ data }) => {
		if (!data || data.from?.instanceId === FIXTURE.instanceId) return
		observedTypes.push(data.type)
		if (data.type === 'identity:probe') {
			send('identity:claim', { startedAt: 1 }, data.from)
		} else if (data.type === 'state:sync-request' && data.payload) {
			send(
				'state:sync',
				{
					requestId: data.payload.requestId,
					requesterInstanceId: data.payload.requesterInstanceId,
					requesterGeneration: data.payload.requesterGeneration,
					responderId: FIXTURE.tabId,
					responderInstanceId: FIXTURE.instanceId,
					responderState: 'ready',
					complete: true,
					state,
				},
				data.from,
			)
		} else if (data.type === 'state:set' || data.type === 'state:delete') {
			const operation = data.payload.operation
			if (operation) state[operation.key] = operation
		}
	}

	writePresence()
	send('tab:announce', { visible: true, view: null, createdAt: Date.now() })
	const heartbeat = setInterval(() => {
		writePresence()
		send('tab:heartbeat', null)
	}, 100)

	return {
		identity: FIXTURE,
		legacySet(key, value) {
			const timestamp = Date.now()
			state[key] = { value, ts: timestamp, tabId: FIXTURE.tabId, version: 0 }
			send('state:set', { key, entry: state[key] })
		},
		legacyDelete(key) {
			delete state[key]
			send('state:delete', { key })
		},
		announceLeader() {
			send('leader:change', {
				generation: 100,
				tabId: FIXTURE.tabId,
				instanceId: FIXTURE.instanceId,
			})
		},
		announceView(name) {
			send('view:claimed', {
				name,
				tabId: FIXTURE.tabId,
				instanceId: FIXTURE.instanceId,
				token: { generation: 100, claimId: `${FIXTURE.instanceId}:${name}` },
			})
		},
		snapshot: () => ({ observedTypes: [...observedTypes], state: structuredClone(state) }),
		stop() {
			clearInterval(heartbeat)
			send('tab:leave', null)
			localStorage.removeItem(`tabula:${namespace}:tab:${FIXTURE.tabId}`)
			channel.close()
		},
	}
}
