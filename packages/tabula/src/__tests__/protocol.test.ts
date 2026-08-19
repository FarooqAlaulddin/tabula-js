import {
	LOCAL_PROTOCOL,
	MAX_MESSAGE_BYTES,
	validateInboundMessage,
	validateStoredOpenIntent,
	validateStoredViewRegistryEntry,
} from '@tabula/protocol'
import { Channel } from '@tabula/tabula'
import { describe, expect, it, vi } from 'vitest'
import { installMockBroadcastChannel, installMockStorage } from './helpers'

function envelope(type: string, payload: unknown, overrides: Record<string, unknown> = {}) {
	return {
		protocol: LOCAL_PROTOCOL,
		type,
		id: 'remote-instance:1',
		from: { tabId: 'remote-tab', instanceId: 'remote-instance' },
		sentAt: Date.now(),
		payload,
		...overrides,
	}
}

const stateEntry = {
	value: { nested: ['value'] },
	ts: 1,
	tabId: 'remote-tab',
	version: 1,
}

const stateOperation = {
	kind: 'set',
	key: 'theme',
	value: { nested: ['value'] },
	clock: { wallTime: 1, logical: 0 },
	tabId: 'remote-tab',
	instanceId: 'remote-instance',
	operationId: 'operation-1',
}

const stateTombstone = {
	kind: 'delete',
	key: 'theme',
	clock: { wallTime: 2, logical: 0 },
	tabId: 'remote-tab',
	instanceId: 'remote-instance',
	operationId: 'operation-2',
}

const viewToken = { generation: 2, claimId: 'view-claim-2' }

describe('protocol validation', () => {
	it('validates 10,000 bounded messages without retaining input state', () => {
		let valid = 0
		for (let index = 0; index < 10_000; index++) {
			const result = validateInboundMessage(
				envelope('tab:heartbeat', null, { id: `stress-instance:${index}` }),
			)
			if (result.kind === 'valid') valid++
		}
		expect(valid).toBe(10_000)
	})

	it.each([
		['identity:probe', { startedAt: 1 }],
		['identity:claim', { startedAt: 1 }],
		['tab:announce', { visible: true, view: null, createdAt: 1 }],
		['tab:heartbeat', null],
		['tab:leave', null],
		['state:set', { key: 'theme', entry: stateEntry }],
		['state:set', { operation: stateOperation }],
		['state:delete', { key: 'theme' }],
		['state:delete', { operation: stateTombstone }],
		['state:batch', { operations: [stateOperation] }],
		['state:sync-request', null],
		[
			'state:sync-request',
			{
				requestId: 'request-1',
				requesterInstanceId: 'requester-instance',
				requesterGeneration: 1,
				knownPeers: ['peer-1'],
				protocolRevision: 1,
			},
		],
		['state:sync', { state: { theme: stateEntry } }],
		['state:sync', { state: { theme: stateTombstone } }],
		[
			'state:sync',
			{
				requestId: 'request-1',
				requesterInstanceId: 'requester-instance',
				requesterGeneration: 1,
				responderId: 'remote-tab',
				responderInstanceId: 'remote-instance',
				responderState: 'ready',
				complete: true,
				state: { theme: stateTombstone },
			},
		],
		['view:claim', { name: 'editor' }],
		['view:claimed', { name: 'editor', tabId: 'remote-tab' }],
		[
			'view:claimed',
			{
				name: 'editor',
				tabId: 'remote-tab',
				instanceId: 'remote-instance',
				token: viewToken,
			},
		],
		['view:release', { name: 'editor' }],
		['view:release', { name: 'editor', token: viewToken, request: true }],
		['view:conflict', { name: 'editor', existingTabId: 'tab-a', incomingTabId: 'tab-b' }],
		['view:focus', { name: 'editor' }],
		['view:focus', { name: 'editor', token: viewToken }],
		['view:intent-claim', { intentId: 'intent-1', name: 'editor', token: viewToken }],
		[
			'view:intent-state',
			{ intentId: 'intent-1', name: 'editor', token: viewToken, operations: [stateOperation] },
		],
		['leader:query', null],
		['leader:change', { tabId: 'remote-tab' }],
		['leader:change', { generation: 2, tabId: 'remote-tab', instanceId: 'remote-instance' }],
	])('accepts a valid %s payload', (type, payload) => {
		expect(validateInboundMessage(envelope(type, payload)).kind).toBe('valid')
	})

	it('accepts the revision-0 fixture and defaults minRevision to zero', () => {
		const result = validateInboundMessage(
			envelope('tab:heartbeat', null, { protocol: { major: 1, revision: 0 } }),
		)
		expect(result.kind).toBe('valid')
		if (result.kind === 'valid') expect(result.message.protocol.minRevision).toBe(0)
	})

	it('ignores additive fields and compatible unknown message types', () => {
		const withOptionalFields = envelope('tab:heartbeat', null, {
			protocol: { ...LOCAL_PROTOCOL, futureVersionField: true },
			futureEnvelopeField: true,
		})
		expect(validateInboundMessage(withOptionalFields).kind).toBe('valid')
		expect(validateInboundMessage(envelope('future:message', { optional: true })).kind).toBe(
			'unknown',
		)
	})

	it.each([
		['missing protocol', { protocol: undefined }],
		['invalid id', { id: '' }],
		['invalid sender', { from: { tabId: '', instanceId: 'instance' } }],
		['invalid target', { to: { tabId: 'tab', instanceId: '' } }],
		['invalid timestamp', { sentAt: Number.NaN }],
	])('rejects an envelope with %s', (_label, overrides) => {
		expect(validateInboundMessage(envelope('tab:heartbeat', null, overrides)).kind).toBe('invalid')
	})

	it('rejects non-overlapping protocol versions', () => {
		expect(
			validateInboundMessage(
				envelope('tab:heartbeat', null, {
					protocol: { major: 2, revision: 0, minRevision: 0 },
				}),
			).kind,
		).toBe('incompatible')
		expect(
			validateInboundMessage(
				envelope('tab:heartbeat', null, {
					protocol: { major: 1, revision: 3, minRevision: 2 },
				}),
			).kind,
		).toBe('incompatible')
	})

	it('rejects malformed fenced leader projections', () => {
		expect(
			validateInboundMessage(
				envelope('leader:change', {
					generation: 0,
					tabId: 'remote-tab',
					instanceId: 'remote-instance',
				}),
			).kind,
		).toBe('invalid')
		expect(
			validateInboundMessage(envelope('leader:change', { generation: 1, tabId: 'remote-tab' }))
				.kind,
		).toBe('invalid')
	})

	it.each([
		['zero generation', { generation: 0, claimId: 'claim' }],
		['fractional generation', { generation: 1.5, claimId: 'claim' }],
		['missing claim id', { generation: 1 }],
		['unsafe claim id', { generation: 1, claimId: 'claim\u0000id' }],
	])('rejects view messages with a malformed token: %s', (_label, token) => {
		expect(validateInboundMessage(envelope('view:release', { name: 'editor', token })).kind).toBe(
			'invalid',
		)
	})

	it('requires modern view claims to provide instance and token together', () => {
		expect(
			validateInboundMessage(
				envelope('view:claimed', {
					name: 'editor',
					tabId: 'remote-tab',
					instanceId: 'remote-instance',
				}),
			).kind,
		).toBe('invalid')
		expect(
			validateInboundMessage(
				envelope('view:claimed', { name: 'editor', tabId: 'remote-tab', token: viewToken }),
			).kind,
		).toBe('invalid')
	})

	it('validates fenced registry projections and metadata-only open intents', () => {
		expect(
			validateStoredViewRegistryEntry({
				tabId: 'remote-tab',
				instanceId: 'remote-instance',
				claimedAt: 1,
				token: viewToken,
			}),
		).not.toBeNull()
		expect(
			validateStoredOpenIntent({
				intentId: 'intent-1',
				view: 'editor',
				requester: { tabId: 'remote-tab', instanceId: 'remote-instance' },
				syncKeys: ['theme'],
				createdAt: 1,
				expiresAt: 2,
			}),
		).not.toBeNull()
		expect(
			validateStoredOpenIntent({
				intentId: 'intent-1',
				view: 'editor',
				requester: { tabId: 'remote-tab', instanceId: 'remote-instance' },
				syncKeys: ['theme'],
				syncedState: { theme: 'dark' },
				createdAt: 1,
				expiresAt: 2,
			}),
		).toBeNull()
	})

	it.each(['__proto__', 'prototype', 'constructor'])(
		'rejects the dangerous state key %s',
		(key) => {
			expect(validateInboundMessage(envelope('state:set', { key, entry: stateEntry })).kind).toBe(
				'invalid',
			)
		},
	)

	it('rejects prototype-polluting nested records', () => {
		const value = JSON.parse('{"safe":{"__proto__":{"polluted":true}}}')
		const result = validateInboundMessage(
			envelope('state:set', { key: 'safe', entry: { ...stateEntry, value } }),
		)
		expect(result.kind).toBe('invalid')
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
	})

	it('rejects malformed operations and duplicate batch keys', () => {
		expect(
			validateInboundMessage(
				envelope('state:set', {
					operation: { ...stateOperation, value: undefined },
				}),
			).kind,
		).toBe('invalid')
		expect(
			validateInboundMessage(
				envelope('state:delete', {
					operation: { ...stateTombstone, value: 'not-a-tombstone' },
				}),
			).kind,
		).toBe('invalid')
		expect(
			validateInboundMessage(
				envelope('state:batch', {
					operations: [stateOperation, { ...stateOperation, operationId: 'operation-3' }],
				}),
			).kind,
		).toBe('invalid')
	})

	it('rejects malformed sync correlations and incomplete snapshots', () => {
		const request = {
			requestId: 'request-1',
			requesterInstanceId: 'requester-instance',
			requesterGeneration: 1,
			knownPeers: ['peer-1'],
			protocolRevision: 1,
		}
		expect(
			validateInboundMessage(
				envelope('state:sync-request', { ...request, knownPeers: ['peer-1', 'peer-1'] }),
			).kind,
		).toBe('invalid')
		expect(
			validateInboundMessage(envelope('state:sync-request', { ...request, requesterGeneration: 0 }))
				.kind,
		).toBe('invalid')
		expect(
			validateInboundMessage(
				envelope('state:sync', {
					requestId: 'request-1',
					requesterInstanceId: 'requester-instance',
					requesterGeneration: 1,
					responderId: 'remote-tab',
					responderInstanceId: 'remote-instance',
					responderState: 'ready',
					complete: false,
					state: {},
				}),
			).kind,
		).toBe('invalid')
	})

	it('rejects excessive byte, depth, and node budgets', () => {
		const oversized = 'x'.repeat(MAX_MESSAGE_BYTES + 1)
		expect(
			validateInboundMessage(
				envelope('state:set', {
					key: 'large',
					entry: { ...stateEntry, value: oversized },
				}),
			).kind,
		).toBe('invalid')

		let deep: Record<string, unknown> = {}
		const root = deep
		for (let index = 0; index < 66; index++) {
			deep.next = {}
			deep = deep.next as Record<string, unknown>
		}
		expect(
			validateInboundMessage(
				envelope('state:set', { key: 'deep', entry: { ...stateEntry, value: root } }),
			).kind,
		).toBe('invalid')

		const nodes = Array.from({ length: 10_001 }, () => ({}))
		expect(
			validateInboundMessage(
				envelope('state:set', { key: 'nodes', entry: { ...stateEntry, value: nodes } }),
			).kind,
		).toBe('invalid')
	})

	it('never throws for fuzzed payloads', () => {
		const corpus: unknown[] = [
			undefined,
			null,
			true,
			0,
			Number.NaN,
			'',
			Symbol('invalid'),
			() => undefined,
			[],
			{},
			new Map([['key', 'value']]),
			new Set(['value']),
			new Uint8Array([1, 2, 3]),
		]
		for (let index = 0; index < 250; index++) {
			const payload = corpus[index % corpus.length]
			expect(() =>
				validateInboundMessage(
					index % 2 === 0 ? payload : envelope('state:set', payload, { id: `fuzz-${index}` }),
				),
			).not.toThrow()
		}
	})
})

describe('protocol channel boundary', () => {
	function setup() {
		const storage = installMockStorage()
		const channels = installMockBroadcastChannel()
		const channel = new Channel('protocol-test', 'local-tab', 'local-instance')
		return {
			channel,
			bc: channels.instances[0],
			teardown() {
				channel.close()
				channels.restore()
				storage.restore()
			},
		}
	}

	it('drops wrong-instance targets before domain dispatch', () => {
		const { channel, bc, teardown } = setup()
		try {
			const handler = vi.fn()
			channel.onMessage(handler)
			bc.simulateMessage(
				envelope('tab:heartbeat', null, {
					to: { tabId: 'local-tab', instanceId: 'other-instance' },
				}),
			)
			expect(handler).not.toHaveBeenCalled()
		} finally {
			teardown()
		}
	})

	it('emits and rejects an incompatible peer/version episode exactly once', () => {
		const { channel, bc, teardown } = setup()
		try {
			const incompatible = vi.fn()
			channel.onProtocolIncompatible(incompatible)
			const message = envelope('tab:heartbeat', null, {
				protocol: { major: 2, revision: 0, minRevision: 0 },
			})
			bc.simulateMessage(message)
			bc.simulateMessage({ ...message, id: 'remote-instance:2' })

			expect(incompatible).toHaveBeenCalledTimes(1)
			expect(incompatible).toHaveBeenCalledWith(
				expect.objectContaining({
					recovery: 'Save work and reload all application tabs.',
					remote: { major: 2, revision: 0, minRevision: 0 },
				}),
			)
			expect(bc.postMessage).toHaveBeenCalledTimes(1)
			expect(bc.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'protocol:reject' }),
			)
		} finally {
			teardown()
		}
	})

	it('caps incompatibility episodes at 128 and warns once', () => {
		const { channel, bc, teardown } = setup()
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
		try {
			const incompatible = vi.fn()
			channel.onProtocolIncompatible(incompatible)
			for (let index = 0; index < 132; index++) {
				bc.simulateMessage(
					envelope('tab:heartbeat', null, {
						id: `peer-${index}:1`,
						from: { tabId: `tab-${index}`, instanceId: `peer-${index}` },
						protocol: { major: 2, revision: 0, minRevision: 0 },
					}),
				)
			}
			expect(incompatible).toHaveBeenCalledTimes(128)
			expect(bc.postMessage).toHaveBeenCalledTimes(128)
			expect(warn).toHaveBeenCalledTimes(1)
		} finally {
			warn.mockRestore()
			teardown()
		}
	})
})
