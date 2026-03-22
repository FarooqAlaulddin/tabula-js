import { Channel } from '@tabula/tabula'
import type { Message } from '@tabula/tabula'
import { describe, expect, it, vi } from 'vitest'
import {
	type MockBroadcastChannel,
	installMockBroadcastChannel,
	installMockStorage,
	makeMessage,
} from './helpers'

describe('Channel', () => {
	let bcMock: { instances: MockBroadcastChannel[]; restore: () => void }
	let storageMock: { restore: () => void }

	function setup(tabId = 'tab-1', namespace = 'test') {
		storageMock = installMockStorage()
		bcMock = installMockBroadcastChannel()
		const channel = new Channel(namespace, tabId)
		const bc = bcMock.instances[0]
		return { channel, bc, tabId }
	}

	function teardown() {
		bcMock?.restore()
		storageMock?.restore()
	}

	describe('constructor', () => {
		it('throws if BroadcastChannel is undefined', () => {
			const storageMk = installMockStorage()
			// Ensure BroadcastChannel is not defined
			const orig = globalThis.BroadcastChannel
			delete (globalThis as any).BroadcastChannel

			expect(() => new Channel('test', 'tab-1')).toThrow('Tabula requires BroadcastChannel')

			// restore
			if (orig) {
				;(globalThis as any).BroadcastChannel = orig
			}
			storageMk.restore()
		})
	})

	describe('send()', () => {
		it('returns a well-formed Message with correct type, from, id, ts', () => {
			const { channel } = setup()
			try {
				const msg = channel.send('tab:announce', { visible: true })
				expect(msg.type).toBe('tab:announce')
				expect(msg.from).toBe('tab-1')
				expect(msg.id).toMatch(/^tab-1:\d+$/)
				expect(msg.ts).toBeTypeOf('number')
				expect(msg.payload).toEqual({ visible: true })
			} finally {
				teardown()
			}
		})

		it('sets msg.to when to field is provided', () => {
			const { channel } = setup()
			try {
				const msg = channel.send('state:sync', { state: {} }, 'tab-2')
				expect(msg.to).toBe('tab-2')
			} finally {
				teardown()
			}
		})

		it('calls postMessage on the underlying BroadcastChannel', () => {
			const { channel, bc } = setup()
			try {
				const msg = channel.send('tab:heartbeat', null)
				expect(bc.postMessage).toHaveBeenCalledWith(msg)
			} finally {
				teardown()
			}
		})
	})

	describe('onMessage', () => {
		it('incoming message is dispatched to all handlers', () => {
			const { channel, bc } = setup()
			try {
				const handler1 = vi.fn()
				const handler2 = vi.fn()
				channel.onMessage(handler1)
				channel.onMessage(handler2)

				const msg = makeMessage({ from: 'remote-tab' })
				bc.simulateMessage(msg)

				expect(handler1).toHaveBeenCalledWith(msg)
				expect(handler2).toHaveBeenCalledWith(msg)
			} finally {
				teardown()
			}
		})

		it('incoming message from self is ignored', () => {
			const { channel, bc, tabId } = setup()
			try {
				const handler = vi.fn()
				channel.onMessage(handler)

				const msg = makeMessage({ from: tabId })
				bc.simulateMessage(msg)

				expect(handler).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})

		it('incoming message addressed to other tab is ignored', () => {
			const { channel, bc } = setup()
			try {
				const handler = vi.fn()
				channel.onMessage(handler)

				const msg = makeMessage({ from: 'remote-tab', to: 'tab-999' })
				bc.simulateMessage(msg)

				expect(handler).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})

		it('incoming message addressed to this tab IS delivered', () => {
			const { channel, bc, tabId } = setup()
			try {
				const handler = vi.fn()
				channel.onMessage(handler)

				const msg = makeMessage({ from: 'remote-tab', to: tabId })
				bc.simulateMessage(msg)

				expect(handler).toHaveBeenCalledWith(msg)
			} finally {
				teardown()
			}
		})
	})

	describe('dedup', () => {
		it('same message ID twice, handler fires only once', () => {
			const { channel, bc } = setup()
			try {
				const handler = vi.fn()
				channel.onMessage(handler)

				const msg = makeMessage({ from: 'remote-tab', id: 'dup-id-1' })
				bc.simulateMessage(msg)
				bc.simulateMessage(msg)

				expect(handler).toHaveBeenCalledTimes(1)
			} finally {
				teardown()
			}
		})
	})

	describe('malformed messages', () => {
		it('messages missing type are ignored', () => {
			const { channel, bc } = setup()
			try {
				const handler = vi.fn()
				channel.onMessage(handler)

				const msg = {
					from: 'remote-tab',
					id: 'msg-1',
					ts: Date.now(),
					payload: {},
				} as unknown as Message
				bc.simulateMessage(msg)

				expect(handler).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})

		it('messages missing id are ignored', () => {
			const { channel, bc } = setup()
			try {
				const handler = vi.fn()
				channel.onMessage(handler)

				const msg = {
					type: 'tab:announce',
					from: 'remote-tab',
					ts: Date.now(),
					payload: {},
				} as unknown as Message
				bc.simulateMessage(msg)

				expect(handler).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})
	})

	describe('onMessage unsubscribe', () => {
		it('unsubscribed handler is not called', () => {
			const { channel, bc } = setup()
			try {
				const handler = vi.fn()
				const unsub = channel.onMessage(handler)
				unsub()

				const msg = makeMessage({ from: 'remote-tab' })
				bc.simulateMessage(msg)

				expect(handler).not.toHaveBeenCalled()
			} finally {
				teardown()
			}
		})
	})

	describe('close()', () => {
		it('prevents further sends and clears handlers', () => {
			const { channel, bc } = setup()
			try {
				const handler = vi.fn()
				channel.onMessage(handler)

				channel.close()

				// send after close should not call postMessage
				channel.send('tab:heartbeat', null)
				expect(bc.postMessage).toHaveBeenCalledTimes(0)

				// incoming messages should not reach handlers (handlers cleared)
				const msg = makeMessage({ from: 'remote-tab' })
				bc.simulateMessage(msg)
				expect(handler).not.toHaveBeenCalled()

				// underlying BC close was called
				expect(bc.close).toHaveBeenCalled()
			} finally {
				teardown()
			}
		})
	})
})
