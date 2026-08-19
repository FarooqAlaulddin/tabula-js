import { Dedup } from '@tabula/tabula'
import { describe, expect, it } from 'vitest'

describe('Dedup', () => {
	it('first encounter returns false', () => {
		const dedup = new Dedup()
		expect(dedup.isDuplicate('msg-1')).toBe(false)
	})

	it('second encounter returns true', () => {
		const dedup = new Dedup()
		dedup.isDuplicate('msg-1')
		expect(dedup.isDuplicate('msg-1')).toBe(true)
	})

	it('different IDs are independent', () => {
		const dedup = new Dedup()
		dedup.isDuplicate('msg-1')
		expect(dedup.isDuplicate('msg-2')).toBe(false)
		expect(dedup.isDuplicate('msg-1')).toBe(true)
		expect(dedup.isDuplicate('msg-2')).toBe(true)
	})

	it('evicts at the 2,048-entry boundary', () => {
		const dedup = new Dedup()

		for (let i = 1; i <= 2048; i++) {
			dedup.isDuplicate(`id-${i}`)
		}

		expect(dedup.isDuplicate('id-1')).toBe(true)
		dedup.isDuplicate('id-2049')
		expect(dedup.isDuplicate('id-1')).toBe(false)
	})

	it('eviction is FIFO not LRU (re-checking does not refresh position)', () => {
		const dedup = new Dedup()

		for (let i = 1; i <= 2048; i++) {
			dedup.isDuplicate(`id-${i}`)
		}

		// Re-check id-1 — this returns true but should NOT move it to the back
		expect(dedup.isDuplicate('id-1')).toBe(true)

		// Insert one more — id-1 should still be evicted because FIFO
		dedup.isDuplicate('id-2049')
		expect(dedup.isDuplicate('id-1')).toBe(false)
	})

	it('exactly 2,048 IDs fit without eviction', () => {
		const dedup = new Dedup()

		for (let i = 1; i <= 2048; i++) {
			dedup.isDuplicate(`id-${i}`)
		}

		for (let i = 1; i <= 2048; i++) {
			expect(dedup.isDuplicate(`id-${i}`)).toBe(true)
		}
	})

	it('expires entries after five minutes', () => {
		let now = 0
		const dedup = new Dedup(2048, 5 * 60_000, () => now)
		expect(dedup.isDuplicate('msg')).toBe(false)
		now = 5 * 60_000
		expect(dedup.isDuplicate('msg')).toBe(true)
		now += 1
		expect(dedup.isDuplicate('msg')).toBe(false)
	})
})
