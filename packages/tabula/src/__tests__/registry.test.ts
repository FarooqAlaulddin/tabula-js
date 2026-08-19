import { Registry } from '@tabula/tabula'
import type { ViewRegistryEntry } from '@tabula/tabula'
import { describe, expect, it, vi } from 'vitest'
import { installMockStorage, installMockWindow } from './helpers'

describe('Registry', () => {
	let storageMock: { restore: () => void }
	let windowMock: ReturnType<typeof installMockWindow>

	function setup(namespace = 'test') {
		storageMock = installMockStorage()
		windowMock = installMockWindow()
		const registry = new Registry(namespace)
		return { registry }
	}

	function teardown() {
		windowMock?.restore()
		storageMock?.restore()
	}

	function makeEntry(overrides: Partial<ViewRegistryEntry> = {}): ViewRegistryEntry {
		return {
			tabId: 'tab-1',
			instanceId: 'instance-1',
			claimedAt: Date.now(),
			token: { generation: 1, claimId: 'claim-1' },
			...overrides,
		}
	}

	describe('get()', () => {
		it('returns null when no entry exists', () => {
			const { registry } = setup()
			try {
				expect(registry.get('nonexistent')).toBeNull()
			} finally {
				teardown()
			}
		})

		it('returns null on corrupt JSON in localStorage', () => {
			const { registry } = setup()
			try {
				localStorage.setItem('tabula:test:view:broken', '{not valid json')
				expect(registry.get('broken')).toBeNull()
			} finally {
				teardown()
			}
		})

		it('returns null for a malformed or prototype-bearing stored entry', () => {
			const { registry } = setup()
			try {
				localStorage.setItem(
					'tabula:test:view:malformed',
					JSON.stringify({ tabId: '', instanceId: '', claimedAt: 'now', token: null }),
				)
				localStorage.setItem(
					'tabula:test:view:polluting',
					'{"tabId":"tab","instanceId":"instance","claimedAt":1,"token":{"generation":1,"claimId":"claim","__proto__":{}}}',
				)
				expect(registry.get('malformed')).toBeNull()
				expect(registry.get('polluting')).toBeNull()
			} finally {
				teardown()
			}
		})
	})

	describe('set() and get()', () => {
		it('roundtrips ViewRegistryEntry via JSON', () => {
			const { registry } = setup()
			try {
				const entry = makeEntry({ tabId: 'tab-42', instanceId: 'instance-42' })
				registry.set('editor', entry)

				const retrieved = registry.get('editor')
				expect(retrieved).toEqual(entry)
			} finally {
				teardown()
			}
		})
	})

	describe('delete()', () => {
		it('removes entry from storage', () => {
			const { registry } = setup()
			try {
				registry.set('editor', makeEntry())
				expect(registry.get('editor')).not.toBeNull()

				registry.delete('editor')
				expect(registry.get('editor')).toBeNull()
			} finally {
				teardown()
			}
		})
	})

	describe('list()', () => {
		it('returns all entries matching prefix, ignores others', () => {
			const { registry } = setup()
			try {
				const entry1 = makeEntry({ tabId: 'tab-1' })
				const entry2 = makeEntry({ tabId: 'tab-2' })
				registry.set('editor', entry1)
				registry.set('writer', entry2)

				// Add unrelated key directly
				localStorage.setItem('unrelated:key', 'value')

				const result = registry.list()
				expect(Object.keys(result)).toHaveLength(2)
				expect(result.editor).toEqual(entry1)
				expect(result.writer).toEqual(entry2)
			} finally {
				teardown()
			}
		})
	})

	describe('startListening()', () => {
		it('registers a storage event handler on window', () => {
			const { registry } = setup()
			try {
				registry.startListening()

				const handlers = windowMock.getHandlers('storage')
				expect(handlers).toHaveLength(1)
			} finally {
				teardown()
			}
		})

		it('is idempotent — calling twice does not add a second handler', () => {
			const { registry } = setup()
			try {
				registry.startListening()
				registry.startListening()

				const handlers = windowMock.getHandlers('storage')
				expect(handlers).toHaveLength(1)
			} finally {
				teardown()
			}
		})
	})

	describe('storage events and onChange', () => {
		it('fires onChange listeners with parsed entry on storage event', () => {
			const { registry } = setup()
			try {
				const listener = vi.fn()
				registry.startListening()
				registry.onChange(listener)

				const entry = makeEntry({ tabId: 'tab-remote' })
				const handlers = windowMock.getHandlers('storage')
				handlers[0]({
					key: 'tabula:test:view:editor',
					newValue: JSON.stringify(entry),
				} as unknown as StorageEvent)

				expect(listener).toHaveBeenCalledWith('editor', entry)
			} finally {
				teardown()
			}
		})

		it('signals deletion (entry=null) when newValue is null', () => {
			const { registry } = setup()
			try {
				const listener = vi.fn()
				registry.startListening()
				registry.onChange(listener)

				const handlers = windowMock.getHandlers('storage')
				handlers[0]({
					key: 'tabula:test:view:editor',
					newValue: null,
				} as unknown as StorageEvent)

				expect(listener).toHaveBeenCalledWith('editor', null)
			} finally {
				teardown()
			}
		})

		it('ignores storage events for unrelated keys', () => {
			const { registry } = setup()
			try {
				const listener = vi.fn()
				registry.startListening()
				registry.onChange(listener)

				const handlers = windowMock.getHandlers('storage')
				handlers[0]({
					key: 'some:other:key',
					newValue: 'value',
				} as unknown as StorageEvent)

				expect(listener).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})

		it('ignores malformed storage event values', () => {
			const { registry } = setup()
			try {
				const listener = vi.fn()
				registry.startListening()
				registry.onChange(listener)
				windowMock.getHandlers('storage')[0]({
					key: 'tabula:test:view:editor',
					newValue: '{"tabId":"","instanceId":"","claimedAt":1,"token":null}',
				} as unknown as StorageEvent)
				expect(listener).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})
	})

	describe('onChange unsubscribe', () => {
		it('unsubscribed listener is not called', () => {
			const { registry } = setup()
			try {
				const listener = vi.fn()
				registry.startListening()
				const unsub = registry.onChange(listener)
				unsub()

				const handlers = windowMock.getHandlers('storage')
				handlers[0]({
					key: 'tabula:test:view:editor',
					newValue: JSON.stringify(makeEntry()),
				} as unknown as StorageEvent)

				expect(listener).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})
	})

	describe('stopListening()', () => {
		it('removes handler and clears listeners', () => {
			const { registry } = setup()
			try {
				const listener = vi.fn()
				registry.startListening()
				registry.onChange(listener)

				registry.stopListening()

				// Handler should have been removed from window
				const handlers = windowMock.getHandlers('storage')
				expect(handlers).toHaveLength(0)

				// Re-start and fire event — old listener should not fire
				registry.startListening()
				const newHandlers = windowMock.getHandlers('storage')
				newHandlers[0]({
					key: 'tabula:test:view:editor',
					newValue: JSON.stringify(makeEntry()),
				} as unknown as StorageEvent)

				expect(listener).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})
	})
})
