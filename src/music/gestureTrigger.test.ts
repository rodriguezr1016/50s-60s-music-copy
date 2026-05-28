import { describe, expect, it } from 'vitest'
import { GestureTriggerDetector } from './gestureTrigger'

describe('GestureTriggerDetector', () => {
  it('detects a fast swipe once and then cools down', () => {
    const detector = new GestureTriggerDetector()
    const points = [
      { x: 0.2, y: 0.5 },
      { x: 0.28, y: 0.5 },
      { x: 0.38, y: 0.49 },
      { x: 0.5, y: 0.49 },
      { x: 0.62, y: 0.48 },
      { x: 0.75, y: 0.48 },
    ]
    const triggers = points
      .map((center, index) => detector.update(1, center, index * 55))
      .filter(Boolean)

    expect(triggers).toHaveLength(1)
    expect(triggers[0]?.type).toBe('swipe')
    expect(detector.update(1, { x: 0.9, y: 0.48 }, 360)?.type).toBeUndefined()
  })

  it('detects circular movement from a looped hand path', () => {
    const detector = new GestureTriggerDetector()
    const triggers = Array.from({ length: 20 }, (_, index) => {
      const angle = (index / 19) * Math.PI * 2
      return detector.update(
        1,
        {
          x: 0.5 + Math.cos(angle) * 0.11,
          y: 0.5 + Math.sin(angle) * 0.11,
        },
        index * 60,
      )
    }).filter(Boolean)

    expect(triggers.some((trigger) => trigger?.type === 'circle')).toBe(true)
  })

  it('does not trigger from a still tracked hand', () => {
    const detector = new GestureTriggerDetector()
    const triggers = Array.from({ length: 20 }, (_, index) =>
      detector.update(1, { x: 0.5, y: 0.5 }, index * 60),
    ).filter(Boolean)

    expect(triggers).toHaveLength(0)
  })
})
