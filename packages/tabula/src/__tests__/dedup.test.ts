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

	it('evicts at 500 boundary (item 501 causes eviction of first)', () => {
		const dedup = new Dedup()

		// Insert 500 items (IDs 1..500)
		for (let i = 1; i <= 500; i++) {
			dedup.isDuplicate(`id-${i}`)
		}

		// All 500 are still known
		expect(dedup.isDuplicate('id-1')).toBe(true)

		// Insert the 501st item — this should evict id-1
		dedup.isDuplicate('id-501')

		// id-1 was evicted, so it looks new again
		expect(dedup.isDuplicate('id-1')).toBe(false)
	})

	it('eviction is FIFO not LRU (re-checking does not refresh position)', () => {
		const dedup = new Dedup()

		// Insert 500 items (IDs 1..500)
		for (let i = 1; i <= 500; i++) {
			dedup.isDuplicate(`id-${i}`)
		}

		// Re-check id-1 — this returns true but should NOT move it to the back
		expect(dedup.isDuplicate('id-1')).toBe(true)

		// Insert one more — id-1 should still be evicted because FIFO
		dedup.isDuplicate('id-501')
		expect(dedup.isDuplicate('id-1')).toBe(false)
	})

	it('exactly 500 IDs fit without eviction', () => {
		const dedup = new Dedup()

		for (let i = 1; i <= 500; i++) {
			dedup.isDuplicate(`id-${i}`)
		}

		// All 500 are still remembered — none evicted
		for (let i = 1; i <= 500; i++) {
			expect(dedup.isDuplicate(`id-${i}`)).toBe(true)
		}
	})
})
