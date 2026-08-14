import { MAX_STATE_KEYS } from '@tabula/protocol'
import { State } from '@tabula/tabula'
import type { StateDeleteOperation, StateOperation, StateSetOperation } from '@tabula/tabula'
import { describe, expect, it, vi } from 'vitest'
import { createStubChannel, makeMessage } from './helpers'

function createState(tabId = 'tab-1') {
	const channel = createStubChannel(tabId)
	const state = new State<Record<string, unknown>>(channel as any, tabId)
	return { state, channel }
}

function setOperation(
	key: string,
	value: unknown,
	overrides: Partial<StateSetOperation> = {},
): StateSetOperation {
	return {
		kind: 'set',
		key,
		value,
		clock: { wallTime: 1000, logical: 0 },
		tabId: 'remote-tab',
		instanceId: 'remote-tab-instance',
		operationId: `${key}-set`,
		...overrides,
	}
}

function deleteOperation(
	key: string,
	overrides: Partial<StateDeleteOperation> = {},
): StateDeleteOperation {
	return {
		kind: 'delete',
		key,
		clock: { wallTime: 1000, logical: 0 },
		tabId: 'remote-tab',
		instanceId: 'remote-tab-instance',
		operationId: `${key}-delete`,
		...overrides,
	}
}

function deliver(state: State<Record<string, unknown>>, operation: StateOperation): void {
	state.handleMessage(
		makeMessage({
			type: operation.kind === 'set' ? 'state:set' : 'state:delete',
			from: { tabId: operation.tabId, instanceId: operation.instanceId },
			payload: { operation },
		}),
	)
}

function permutations<T>(values: T[]): T[][] {
	if (values.length <= 1) return [values]
	return values.flatMap((value, index) =>
		permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [
			value,
			...rest,
		]),
	)
}

describe('State operation convergence', () => {
	it('sets, gets, clones, lists, and deletes values', () => {
		const { state } = createState()
		const input = { nested: { count: 1 } }
		state.set('theme', input)
		input.nested.count = 2

		expect(state.get('theme')).toEqual({ nested: { count: 1 } })
		expect(state.keys()).toEqual(['theme'])
		expect(state.allEntries()).toEqual([['theme', { nested: { count: 1 } }]])

		state.delete('theme')
		expect(state.get('theme')).toBeUndefined()
		expect(state.keys()).toEqual([])
		expect(state.allEntries()).toEqual([])
		expect(state.getSnapshot().theme.kind).toBe('delete')
	})

	it.each(['__proto__', 'prototype', 'constructor'])('rejects unsafe local key %s', (key) => {
		const { state, channel } = createState()
		expect(() => state.set(key, 'value')).toThrow(TypeError)
		expect(() => state.delete(key)).toThrow(TypeError)
		expect(channel.send).not.toHaveBeenCalled()
	})

	it('rejects undefined and non-cloneable values without sending or committing', () => {
		const { state, channel } = createState()
		expect(() => state.set('undefined', undefined)).toThrow(/state\.delete/)
		expect(() => state.set('function', () => undefined)).toThrow(TypeError)
		expect(() => state.set('promise', Promise.resolve())).toThrowError(
			expect.objectContaining({ name: 'DataCloneError' }),
		)
		expect(channel.send).not.toHaveBeenCalled()
		expect(state.keys()).toEqual([])
	})

	it('preserves cyclic and standard structured-clone values', () => {
		const { state } = createState()
		const cyclic: Record<string, unknown> = { map: new Map([['key', new Set([1, 2])]]) }
		cyclic.self = cyclic
		state.set('complex', cyclic)

		const result = state.get('complex') as typeof cyclic
		expect(result).not.toBe(cyclic)
		expect(result.self).toBe(result)
		expect(result.map).toBeInstanceOf(Map)
	})

	it('does not commit or notify when BroadcastChannel send throws DataCloneError', () => {
		const { state, channel } = createState()
		const keyListener = vi.fn()
		const wildcard = vi.fn()
		state.onKey('theme', keyListener)
		state.onWildcard(wildcard)
		channel.send.mockImplementation(() => {
			throw new DOMException('clone failed', 'DataCloneError')
		})

		expect(() => state.set('theme', 'dark')).toThrowError(
			expect.objectContaining({ name: 'DataCloneError' }),
		)
		expect(state.get('theme')).toBeUndefined()
		expect(state.getSnapshot()).not.toHaveProperty('theme')
		expect(keyListener).not.toHaveBeenCalled()
		expect(wildcard).not.toHaveBeenCalled()
	})

	it('uses an HLC that advances through clock rollback', () => {
		const { state, channel } = createState()
		const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
		state.set('value', 1)
		now.mockReturnValue(500)
		state.set('value', 2)

		const operations = channel.send.mock.calls.map((call) => (call[1] as any).operation)
		expect(operations[0].clock).toEqual({ wallTime: 1000, logical: 0 })
		expect(operations[1].clock).toEqual({ wallTime: 1000, logical: 1 })
		expect(state.get('value')).toBe(2)
	})

	it('advances the local HLC from an accepted remote clock', () => {
		const { state, channel } = createState()
		vi.spyOn(Date, 'now').mockReturnValue(100)
		deliver(state, setOperation('remote', true, { clock: { wallTime: 5000, logical: 7 } }))
		state.set('local', true)

		const local = (channel.send.mock.calls.at(-1)?.[1] as any).operation as StateOperation
		expect(local.clock).toEqual({ wallTime: 5000, logical: 9 })
	})

	it('converges for every permutation of the same set/delete operation set', () => {
		const operations: StateOperation[] = [
			setOperation('key', 'first', { clock: { wallTime: 10, logical: 0 }, operationId: 'a' }),
			deleteOperation('key', { clock: { wallTime: 10, logical: 1 }, operationId: 'b' }),
			setOperation('key', 'stale', { clock: { wallTime: 9, logical: 99 }, operationId: 'c' }),
			setOperation('key', 'winner', {
				clock: { wallTime: 10, logical: 1 },
				tabId: 'z-tab',
				instanceId: 'z-instance',
				operationId: 'd',
			}),
		]

		for (const ordering of permutations(operations)) {
			const { state } = createState()
			for (const operation of ordering) deliver(state, operation)
			expect(state.get('key')).toBe('winner')
			expect(state.getSnapshot().key).toEqual(operations[3])
		}
	})

	it('uses instance and operation IDs as final deterministic tie breakers', () => {
		const { state } = createState()
		const base = { clock: { wallTime: 10, logical: 2 }, tabId: 'same-tab' }
		deliver(state, setOperation('key', 'a', { ...base, instanceId: 'a', operationId: 'z' }))
		deliver(state, setOperation('key', 'b', { ...base, instanceId: 'b', operationId: 'a' }))
		deliver(state, setOperation('key', 'c', { ...base, instanceId: 'b', operationId: 'z' }))
		expect(state.get('key')).toBe('c')
	})

	it('uses locale-independent code-unit ordering for actor ties', () => {
		const { state } = createState()
		const base = { clock: { wallTime: 10, logical: 2 }, instanceId: 'instance' }
		deliver(state, setOperation('key', 'upper', { ...base, tabId: 'Z', operationId: 'same' }))
		deliver(state, setOperation('key', 'lower', { ...base, tabId: 'a', operationId: 'same' }))
		expect(state.get('key')).toBe('lower')
	})

	it('retains tombstones against delayed sets and stale snapshots', () => {
		const { state } = createState()
		const stale = setOperation('draft', 'old', { clock: { wallTime: 5, logical: 0 } })
		const tombstone = deleteOperation('draft', { clock: { wallTime: 6, logical: 0 } })
		deliver(state, tombstone)
		deliver(state, stale)
		state.handleMessage(
			makeMessage({
				type: 'state:sync',
				from: 'peer',
				payload: { state: { draft: stale } },
			}),
		)

		expect(state.get('draft')).toBeUndefined()
		expect(state.keys()).toEqual([])
		expect(state.getSnapshot().draft).toEqual(tombstone)
	})

	it('fires listeners once only for effective winning operations', () => {
		const { state } = createState()
		const keyListener = vi.fn()
		const wildcard = vi.fn()
		state.onKey('key', keyListener)
		state.onWildcard(wildcard)
		const winner = setOperation('key', 'winner', { clock: { wallTime: 20, logical: 0 } })
		const stale = setOperation('key', 'stale', { clock: { wallTime: 10, logical: 0 } })

		deliver(state, winner)
		deliver(state, winner)
		deliver(state, stale)

		expect(keyListener).toHaveBeenCalledTimes(1)
		expect(keyListener).toHaveBeenCalledWith('winner')
		expect(wildcard).toHaveBeenCalledTimes(1)
	})

	it('setAll sends one sorted atomic batch and installs all winners before callbacks', () => {
		const { state, channel } = createState()
		const order: string[] = []
		state.onKey('a', () => order.push(`key:a:${String(state.get('b'))}`))
		state.onKey('b', () => order.push(`key:b:${String(state.get('a'))}`))
		state.onWildcard((key) => order.push(`wildcard:${key}`))

		state.setAll({ b: 2, a: 1 })

		expect(channel.send).toHaveBeenCalledTimes(1)
		expect(channel.send.mock.calls[0][0]).toBe('state:batch')
		expect(
			(channel.send.mock.calls[0][1] as any).operations.map((op: StateOperation) => op.key),
		).toEqual(['a', 'b'])
		expect(order).toEqual(['key:a:2', 'key:b:1', 'wildcard:a', 'wildcard:b'])
	})

	it('remote batches are installed atomically before ordered notifications', () => {
		const { state } = createState()
		const observations: string[] = []
		state.onKey('a', () => observations.push(`a:${String(state.get('b'))}`))
		state.onKey('b', () => observations.push(`b:${String(state.get('a'))}`))
		state.handleMessage(
			makeMessage({
				type: 'state:batch',
				from: 'remote-tab',
				payload: {
					operations: [setOperation('b', 2), setOperation('a', 1)],
				},
			}),
		)
		expect(observations).toEqual(['a:2', 'b:1'])
	})

	it('setAll validates and sends the entire batch before committing any prefix', () => {
		const { state, channel } = createState()
		expect(() => state.setAll({ a: 1, b: Promise.resolve() })).toThrowError(
			expect.objectContaining({ name: 'DataCloneError' }),
		)
		expect(channel.send).not.toHaveBeenCalled()
		expect(state.keys()).toEqual([])

		channel.send.mockImplementation(() => {
			throw new DOMException('send failed', 'DataCloneError')
		})
		expect(() => state.setAll({ a: 1, b: 2 })).toThrowError(
			expect.objectContaining({ name: 'DataCloneError' }),
		)
		expect(state.keys()).toEqual([])
	})

	it('synchronizes tombstones while keeping them out of value-facing helpers', () => {
		const first = createState('tab-1')
		first.state.delete('gone')
		first.state.handleMessage(
			makeMessage({ type: 'state:sync-request', from: 'tab-2', payload: null }),
		)
		const sync = first.channel.send.mock.calls.find((call) => call[0] === 'state:sync')
		const snapshot = (sync?.[1] as any).state
		expect(snapshot.gone.kind).toBe('delete')

		const second = createState('tab-2')
		second.state.handleMessage(
			makeMessage({ type: 'state:sync', from: 'tab-1', payload: { state: snapshot } }),
		)
		expect(second.state.get('gone')).toBeUndefined()
		expect(second.state.keys()).toEqual([])
		expect(second.state.getSnapshot().gone.kind).toBe('delete')
	})

	it('supports subscriptions and safe unsubscribe', () => {
		const { state } = createState()
		const key = vi.fn()
		const wildcard = vi.fn()
		const offKey = state.onKey('value', key)
		const offWildcard = state.onWildcard(wildcard)
		state.set('value', 1)
		offKey()
		offWildcard()
		state.set('value', 2)
		expect(key).toHaveBeenCalledTimes(1)
		expect(wildcard).toHaveBeenCalledTimes(1)
	})

	it('enforces the observed-key cap including tombstones', () => {
		const { state, channel } = createState()
		const snapshot = Object.fromEntries(
			Array.from({ length: MAX_STATE_KEYS }, (_, index) => {
				const key = `key-${index}`
				return [key, deleteOperation(key, { operationId: `delete-${index}` })]
			}),
		)
		state.handleMessage(
			makeMessage({ type: 'state:sync', from: 'remote-tab', payload: { state: snapshot } }),
		)
		expect(Object.keys(state.getSnapshot())).toHaveLength(MAX_STATE_KEYS)
		expect(() => state.set('overflow', true)).toThrow(RangeError)
		expect(channel.send).not.toHaveBeenCalled()
	})

	it('requests sync and returns selected live values only', () => {
		const { state, channel } = createState()
		state.setAll({ theme: 'dark', count: 2 })
		state.delete('count')
		expect(state.getKeysForSync(['theme', 'count', 'missing'])).toEqual({ theme: 'dark' })
		channel.send.mockClear()
		state.requestSync()
		expect(channel.send).toHaveBeenCalledWith('state:sync-request', null)
	})
})
