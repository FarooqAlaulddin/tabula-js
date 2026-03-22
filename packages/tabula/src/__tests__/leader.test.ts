import { Leader } from '@tabula/tabula'
import { describe, expect, it, vi } from 'vitest'
import { createStubPresence, makeTab } from './helpers'

describe('Leader', () => {
	it('single tab becomes leader', () => {
		const presence = createStubPresence('tab-1')
		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)

		leader.recalculate()

		expect(leader.getLeaderId()).toBe('tab-1')
		expect(leader.isLeader()).toBe(true)
		expect(onChange).toHaveBeenCalledWith('tab-1')
	})

	it('oldest tab (smallest firstSeenAt) wins', () => {
		const oldTab = makeTab({ id: 'tab-old', firstSeenAt: 1000, visible: true })
		makeTab({ id: 'tab-new', firstSeenAt: 2000, visible: true })
		const presence = createStubPresence('tab-new', [oldTab])
		// Override self's firstSeenAt to be newer
		;(presence.getSelf() as any).firstSeenAt = 2000

		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)
		leader.recalculate()

		expect(leader.getLeaderId()).toBe('tab-old')
		expect(leader.isLeader()).toBe(false)
	})

	it('tiebreaker: lexicographic tabId when timestamps equal', () => {
		const tabA = makeTab({ id: 'aaa', firstSeenAt: 1000, visible: true })
		makeTab({ id: 'zzz', firstSeenAt: 1000, visible: true })
		const presence = createStubPresence('zzz', [tabA])
		;(presence.getSelf() as any).firstSeenAt = 1000
		;(presence.getSelf() as any).id = 'zzz'

		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)
		leader.recalculate()

		expect(leader.getLeaderId()).toBe('aaa')
	})

	it('oldest tab wins regardless of visibility', () => {
		const hiddenOld = makeTab({ id: 'tab-hidden', firstSeenAt: 1000, visible: false })
		makeTab({ id: 'tab-visible', firstSeenAt: 2000, visible: true })
		const presence = createStubPresence('tab-visible', [hiddenOld])
		;(presence.getSelf() as any).firstSeenAt = 2000

		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)
		leader.recalculate()

		// Visibility does NOT affect election — oldest tab is leader
		expect(leader.getLeaderId()).toBe('tab-hidden')
	})

	it('all hidden: oldest hidden wins', () => {
		const hiddenOld = makeTab({ id: 'tab-a', firstSeenAt: 1000, visible: false })
		makeTab({ id: 'tab-b', firstSeenAt: 2000, visible: false })
		const presence = createStubPresence('tab-b', [hiddenOld])
		;(presence.getSelf() as any).firstSeenAt = 2000
		;(presence.getSelf() as any).visible = false

		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)
		leader.recalculate()

		expect(leader.getLeaderId()).toBe('tab-a')
	})

	it('all visible: oldest visible wins', () => {
		const visibleOld = makeTab({ id: 'tab-a', firstSeenAt: 1000, visible: true })
		makeTab({ id: 'tab-b', firstSeenAt: 2000, visible: true })
		const presence = createStubPresence('tab-b', [visibleOld])
		;(presence.getSelf() as any).firstSeenAt = 2000

		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)
		leader.recalculate()

		expect(leader.getLeaderId()).toBe('tab-a')
	})

	it('onChange not called if leader does not change', () => {
		const presence = createStubPresence('tab-1')
		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)

		leader.recalculate()
		expect(onChange).toHaveBeenCalledTimes(1)

		leader.recalculate()
		expect(onChange).toHaveBeenCalledTimes(1)
	})

	it('onChange called when leader changes', () => {
		const presence = createStubPresence('tab-1')
		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)

		leader.recalculate()
		expect(onChange).toHaveBeenCalledWith('tab-1')

		// A new, older tab joins
		const olderTab = makeTab({ id: 'tab-older', firstSeenAt: 1, visible: true })
		presence.setTabs([olderTab])

		leader.recalculate()
		expect(onChange).toHaveBeenCalledTimes(2)
		expect(onChange).toHaveBeenLastCalledWith('tab-older')
	})

	it('getLeaderId() returns null before first recalculate', () => {
		const presence = createStubPresence('tab-1')
		const leader = new Leader(presence as any, vi.fn())

		expect(leader.getLeaderId()).toBeNull()
	})

	it('isLeader() returns true only when this tab is leader', () => {
		const otherTab = makeTab({ id: 'tab-other', firstSeenAt: 1, visible: true })
		const presence = createStubPresence('tab-self', [otherTab])
		const leader = new Leader(presence as any, vi.fn())

		// Before recalculate
		expect(leader.isLeader()).toBe(false)

		// After recalculate — tab-other is older so it becomes leader
		leader.recalculate()
		expect(leader.isLeader()).toBe(false)
		expect(leader.getLeaderId()).toBe('tab-other')

		// Remove the other tab so self becomes leader
		presence.setTabs([])
		leader.recalculate()
		expect(leader.isLeader()).toBe(true)
	})

	it('empty tab list: no crash', () => {
		// Create a stub presence that returns an empty tab list
		const presence = {
			tabId: 'tab-1',
			getAllTabs: () => [],
		}
		const onChange = vi.fn()
		const leader = new Leader(presence as any, onChange)

		expect(() => leader.recalculate()).not.toThrow()
		expect(leader.getLeaderId()).toBeNull()
		expect(onChange).not.toHaveBeenCalled()
	})
})
