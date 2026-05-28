import { describe, expect, it } from 'vitest'
import { extractGestureFeatures, type Point } from './gesture'

const hand = (x: number, y: number): Point[] => [
  { x, y },
  { x: x + 0.04, y: y + 0.02 },
  { x: x - 0.05, y: y + 0.03 },
  { x: x + 0.02, y: y + 0.04 },
  { x: x - 0.02, y: y + 0.04 },
  { x: x + 0.05, y: y + 0.01 },
  { x: x + 0.08, y: y - 0.05 },
  { x: x + 0.09, y: y - 0.08 },
  { x: x + 0.1, y: y - 0.1 },
  { x, y: y - 0.01 },
  { x, y: y - 0.06 },
  { x, y: y - 0.1 },
  { x, y: y - 0.12 },
  { x: x - 0.04, y: y + 0.01 },
  { x: x - 0.07, y: y - 0.04 },
  { x: x - 0.08, y: y - 0.07 },
  { x: x - 0.09, y: y - 0.1 },
  { x: x - 0.07, y: y + 0.03 },
  { x: x - 0.1, y: y },
  { x: x - 0.12, y: y - 0.02 },
  { x: x - 0.13, y: y - 0.04 },
]

describe('extractGestureFeatures', () => {
  it('detects hand count, height, size, and upward motion', () => {
    const first = extractGestureFeatures([hand(0.5, 0.62)], undefined, 33)
    const second = extractGestureFeatures([hand(0.5, 0.42), hand(0.66, 0.44)], first, 33)

    expect(second.features.handCount).toBe(2)
    expect(second.features.height).toBeGreaterThan(first.features.height)
    expect(second.features.size).toBeGreaterThan(first.features.size)
    expect(second.features.direction).toBe('up')
    expect(second.features.speed).toBeGreaterThan(0)
  })

  it('returns stable neutral data when no hands are visible', () => {
    const first = extractGestureFeatures([hand(0.5, 0.62)], undefined, 33)
    const empty = extractGestureFeatures([], first, 33)

    expect(empty.features.handCount).toBe(0)
    expect(empty.features.height).toBe(first.features.height)
    expect(empty.features.speed).toBe(0)
    expect(empty.features.direction).toBe('level')
  })
})
