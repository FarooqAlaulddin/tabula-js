import { State } from '@tabula/tabula'
import type { StateEntry } from '@tabula/tabula'
import { describe, expect, it, vi } from 'vitest'
import { createStubChannel, makeMessage } from './helpers'

function createState(tabId = 'tab-1') {
	const channel = createStubChannel(tabId)
	const state = new State<Record<string, unknown>>(channel as any, tabId)
	return { state, channel }
}

function makeStateEntry(overrides: Partial<StateEntry> = {}): StateEntry {
	return {
		value: 'default',
		ts: 1000,
		tabId: 'remote-tab',
		version: 1,
		...overrides,
	}
}

describe('State', () => {
	it('set/get roundtrip', () => {
		const { state } = createState()
		state.set('theme', 'dark')
		expect(state.get('theme')).toBe('dark')
	})

	it('get returns undefined for missing keys', () => {
		const { state } = createState()
		expect(state.get('nonexistent')).toBeUndefined()
	})

	it('delete removes key', () => {
		const { state } = createState()
		state.set('theme', 'dark')
		state.delete('theme')
		expect(state.get('theme')).toBeUndefined()
	})

	it('set increments version per key', () => {
		const { state, channel } = createState()

		state.set('count', 1)
		const firstCall = channel.send.mock.calls[0]
		expect(firstCall[0]).toBe('state:set')
		expect((firstCall[1] as any).entry.version).toBe(1)

		state.set('count', 2)
		const secondCall = channel.send.mock.calls[1]
		expect((secondCall[1] as any).entry.version).toBe(2)

		// A different key starts at version 1
		state.set('theme', 'light')
		const thirdCall = channel.send.mock.calls[2]
		expect((thirdCall[1] as any).entry.version).toBe(1)
	})

	it('set broadcasts state:set via channel', () => {
		const { state, channel } = createState()
		state.set('theme', 'dark')

		expect(channel.send).toHaveBeenCalledWith('state:set', {
			key: 'theme',
			entry: expect.objectContaining({
				value: 'dark',
				tabId: 'tab-1',
				version: 1,
			}),
		})
	})

	it('delete broadcasts state:delete via channel', () => {
		const { state, channel } = createState()
		state.set('theme', 'dark')
		state.delete('theme')

		expect(channel.send).toHaveBeenCalledWith('state:delete', { key: 'theme' })
	})

	describe('LWW conflict resolution', () => {
		it('remote newer timestamp wins', () => {
			const { state } = createState()
			// Set a local value with a known timestamp
			state.set('theme', 'dark')

			// Simulate a remote set with a future timestamp
			const remoteEntry = makeStateEntry({
				value: 'light',
				ts: Date.now() + 10000,
				tabId: 'remote-tab',
				version: 1,
			})
			state.handleMessage(
				makeMessage({
					type: 'state:set',
					from: 'remote-tab',
					payload: { key: 'theme', entry: remoteEntry },
				}),
			)

			expect(state.get('theme')).toBe('light')
		})

		it('remote older timestamp loses', () => {
			const { state } = createState()
			state.set('theme', 'dark')

			const remoteEntry = makeStateEntry({
				value: 'light',
				ts: 1, // very old timestamp
				tabId: 'remote-tab',
				version: 1,
			})
			state.handleMessage(
				makeMessage({
					type: 'state:set',
					from: 'remote-tab',
					payload: { key: 'theme', entry: remoteEntry },
				}),
			)

			expect(state.get('theme')).toBe('dark')
		})

		it('timestamp tie, higher tabId wins', () => {
			const { state } = createState('aaa')
			const fixedTs = 5000

			// Manually set up a local entry by simulating the internal state
			// Use a remote message with the same timestamp from a "lower" tabId first
			const localEntry = makeStateEntry({ value: 'local', ts: fixedTs, tabId: 'aaa', version: 1 })
			state.handleMessage(
				makeMessage({
					type: 'state:set',
					from: 'aaa',
					payload: { key: 'color', entry: localEntry },
				}),
			)

			// Now a remote entry with same ts but higher tabId
			const remoteEntry = makeStateEntry({ value: 'remote', ts: fixedTs, tabId: 'zzz', version: 1 })
			state.handleMessage(
				makeMessage({
					type: 'state:set',
					from: 'zzz',
					payload: { key: 'color', entry: remoteEntry },
				}),
			)

			expect(state.get('color')).toBe('remote')
		})

		it('timestamp tie, lower tabId loses', () => {
			const { state } = createState('zzz')
			const fixedTs = 5000

			// Set up an entry from a higher tabId
			const highEntry = makeStateEntry({ value: 'high', ts: fixedTs, tabId: 'zzz', version: 1 })
			state.handleMessage(
				makeMessage({
					type: 'state:set',
					from: 'zzz',
					payload: { key: 'color', entry: highEntry },
				}),
			)

			// Remote entry with same ts but lower tabId should lose
			const lowEntry = makeStateEntry({ value: 'low', ts: fixedTs, tabId: 'aaa', version: 1 })
			state.handleMessage(
				makeMessage({
					type: 'state:set',
					from: 'aaa',
					payload: { key: 'color', entry: lowEntry },
				}),
			)

			expect(state.get('color')).toBe('high')
		})
	})

	it('remote set for nonexistent key always accepted', () => {
		const { state } = createState()

		const remoteEntry = makeStateEntry({
			value: 'new-value',
			ts: 1, // even an old timestamp
			tabId: 'remote-tab',
			version: 1,
		})
		state.handleMessage(
			makeMessage({
				type: 'state:set',
				from: 'remote-tab',
				payload: { key: 'brand-new', entry: remoteEntry },
			}),
		)

		expect(state.get('brand-new')).toBe('new-value')
	})

	describe('listeners', () => {
		it('onKey listener fires on local set', () => {
			const { state } = createState()
			const cb = vi.fn()
			state.onKey('theme', cb)

			state.set('theme', 'dark')
			expect(cb).toHaveBeenCalledWith('dark')
		})

		it('onKey listener fires on accepted remote set', () => {
			const { state } = createState()
			const cb = vi.fn()
			state.onKey('theme', cb)

			const remoteEntry = makeStateEntry({
				value: 'light',
				ts: Date.now() + 10000,
				tabId: 'remote-tab',
			})
			state.handleMessage(
				makeMessage({
					type: 'state:set',
					from: 'remote-tab',
					payload: { key: 'theme', entry: remoteEntry },
				}),
			)

			expect(cb).toHaveBeenCalledWith('light')
		})

		it('onKey listener does NOT fire on rejected remote set', () => {
			const { state } = createState()
			state.set('theme', 'dark')

			const cb = vi.fn()
			state.onKey('theme', cb)

			// Remote with old timestamp — should be rejected
			const remoteEntry = makeStateEntry({
				value: 'light',
				ts: 1,
				tabId: 'remote-tab',
			})
			state.handleMessage(
				makeMessage({
					type: 'state:set',
					from: 'remote-tab',
					payload: { key: 'theme', entry: remoteEntry },
				}),
			)

			expect(cb).not.toHaveBeenCalled()
		})

		it('onWildcard fires on every accepted change', () => {
			const { state } = createState()
			const cb = vi.fn()
			state.onWildcard(cb)

			state.set('theme', 'dark')
			state.set('count', 42)

			expect(cb).toHaveBeenCalledTimes(2)
			expect(cb).toHaveBeenCalledWith('theme', 'dark')
			expect(cb).toHaveBeenCalledWith('count', 42)
		})

		it('unsubscribe works for onKey', () => {
			const { state } = createState()
			const cb = vi.fn()
			const unsub = state.onKey('theme', cb)

			unsub()
			state.set('theme', 'dark')

			expect(cb).not.toHaveBeenCalled()
		})

		it('unsubscribe works for onWildcard', () => {
			const { state } = createState()
			const cb = vi.fn()
			const unsub = state.onWildcard(cb)

			unsub()
			state.set('theme', 'dark')

			expect(cb).not.toHaveBeenCalled()
		})

		it('delete notifies with undefined', () => {
			const { state } = createState()
			state.set('theme', 'dark')

			const keyCb = vi.fn()
			const wildcardCb = vi.fn()
			state.onKey('theme', keyCb)
			state.onWildcard(wildcardCb)

			state.delete('theme')

			expect(keyCb).toHaveBeenCalledWith(undefined)
			expect(wildcardCb).toHaveBeenCalledWith('theme', undefined)
		})
	})

	describe('sync protocol', () => {
		it('state:sync-request responds with full snapshot', () => {
			const { state, channel } = createState('tab-1')
			state.set('theme', 'dark')
			state.set('count', 42)

			// Simulate a sync request from another tab
			state.handleMessage(
				makeMessage({
					type: 'state:sync-request',
					from: 'tab-2',
				}),
			)

			// Should have sent state:sync back to tab-2
			const syncCall = channel.send.mock.calls.find((call: any[]) => call[0] === 'state:sync')
			expect(syncCall).toBeDefined()
			expect(syncCall?.[2]).toBe('tab-2') // directed to requester

			const snapshot = (syncCall?.[1] as any).state
			expect(snapshot.theme.value).toBe('dark')
			expect(snapshot.count.value).toBe(42)
		})

		it('state:sync merges using LWW', () => {
			const { state } = createState('tab-1')
			state.set('theme', 'dark')

			// Simulate receiving a sync with a newer value for theme and a new key
			const newerTs = Date.now() + 10000
			state.handleMessage(
				makeMessage({
					type: 'state:sync',
					from: 'tab-2',
					payload: {
						state: {
							theme: makeStateEntry({ value: 'light', ts: newerTs, tabId: 'tab-2' }),
							newKey: makeStateEntry({ value: 'hello', ts: newerTs, tabId: 'tab-2' }),
						},
					},
				}),
			)

			expect(state.get('theme')).toBe('light')
			expect(state.get('newKey')).toBe('hello')
		})

		it('state:sync rejects entries that lose LWW', () => {
			const { state } = createState('tab-1')
			state.set('theme', 'dark')

			// Simulate receiving a sync with an older value for theme
			state.handleMessage(
				makeMessage({
					type: 'state:sync',
					from: 'tab-2',
					payload: {
						state: {
							theme: makeStateEntry({ value: 'light', ts: 1, tabId: 'tab-2' }),
						},
					},
				}),
			)

			expect(state.get('theme')).toBe('dark')
		})

		it('requestSync sends state:sync-request', () => {
			const { state, channel } = createState()
			state.requestSync()

			expect(channel.send).toHaveBeenCalledWith('state:sync-request', null)
		})
	})

	describe('snapshot helpers', () => {
		it('getSnapshot returns all entries', () => {
			const { state } = createState()
			state.set('theme', 'dark')
			state.set('count', 42)

			const snapshot = state.getSnapshot()
			expect(Object.keys(snapshot)).toHaveLength(2)
			expect(snapshot.theme.value).toBe('dark')
			expect(snapshot.count.value).toBe(42)
		})

		it('getKeysForSync returns values for requested keys only', () => {
			const { state } = createState()
			state.set('theme', 'dark')
			state.set('count', 42)
			state.set('extra', 'ignored')

			const result = state.getKeysForSync(['theme', 'count'])
			expect(result).toEqual({ theme: 'dark', count: 42 })
			expect(result).not.toHaveProperty('extra')
		})

		it('getKeysForSync skips keys that have no entry', () => {
			const { state } = createState()
			state.set('theme', 'dark')

			const result = state.getKeysForSync(['theme', 'missing'])
			expect(result).toEqual({ theme: 'dark' })
		})
	})
})
