import { describe, expect, it } from 'vitest'
import { RoomEnergyAnalyzer } from './roomEnergy'
import type { Point } from './gesture'

const hand = (x: number, y: number): Point[] =>
  Array.from({ length: 21 }, (_, index) => ({
    x: x + (index % 5) * 0.006,
    y: y + Math.floor(index / 5) * 0.006,
  }))

describe('RoomEnergyAnalyzer', () => {
  it('keeps a baseline groove with no hands', () => {
    const analyzer = new RoomEnergyAnalyzer()
    const state = analyzer.update([], 112)

    expect(state.crowdPresence).toBe(0)
    expect(state.activityScore).toBe(0)
    expect(state.tempo).toBe(112)
    expect(state.activeLayers).toContain('drums')
    expect(state.activeLayers).toContain('bass')
  })

  it('raises activity when one hand moves quickly', () => {
    const analyzer = new RoomEnergyAnalyzer()
    analyzer.update([hand(0.2, 0.5)], 112)
    const state = analyzer.update([hand(0.55, 0.46)], 112)

    expect(state.roomMotion).toBeGreaterThan(0.5)
    expect(state.activityScore).toBeGreaterThan(0.1)
    expect(state.tempo).toBeGreaterThan(112)
  })

  it('responds more strongly to many spread-out hands', () => {
    const analyzer = new RoomEnergyAnalyzer()
    analyzer.update([hand(0.2, 0.5)], 112)
    const oneHand = analyzer.update([hand(0.22, 0.5)], 112)
    analyzer.reset()
    analyzer.update([hand(0.2, 0.5), hand(0.8, 0.52), hand(0.5, 0.2)], 112)
    const manyHands = analyzer.update([hand(0.24, 0.48), hand(0.76, 0.55), hand(0.54, 0.25)], 112)

    expect(manyHands.gestureSpread).toBeGreaterThan(oneHand.gestureSpread)
    expect(manyHands.activityScore).toBeGreaterThan(oneHand.activityScore)
  })

  it('smooths sudden movement changes', () => {
    const analyzer = new RoomEnergyAnalyzer()
    analyzer.update([hand(0.2, 0.5)], 110)
    const active = analyzer.update([hand(0.8, 0.5)], 110)
    const settled = analyzer.update([hand(0.8, 0.5)], 110)

    expect(active.activityScore).toBeGreaterThan(settled.activityScore)
    expect(settled.activityScore).toBeGreaterThan(0)
  })
})
