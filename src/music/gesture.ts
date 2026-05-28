import type { Articulation, Direction, GestureFeatures } from './types'

export type Point = {
  x: number
  y: number
  z?: number
}

export type GestureSnapshot = {
  features: GestureFeatures
  center: Point
  rawCenter: Point
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const PALM_LANDMARKS = [0, 5, 9, 13, 17]

function averagePoint(points: Point[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function stableHandCenter(hand: Point[]) {
  const palmPoints = PALM_LANDMARKS.map((index) => hand[index]).filter(Boolean)
  return averagePoint(palmPoints.length ? palmPoints : hand)
}

export function extractGestureFeatures(
  hands: Point[][],
  previous?: GestureSnapshot,
  deltaMs = 33,
): GestureSnapshot {
  if (!hands.length) {
    return {
      center: previous?.center ?? { x: 0.5, y: 0.5 },
      rawCenter: previous?.rawCenter ?? previous?.center ?? { x: 0.5, y: 0.5 },
      features: {
        handCount: 0,
        height: previous?.features.height ?? 0.5,
        speed: 0,
        horizontal: 0.5,
        vertical: 0.5,
        size: previous?.features.size ?? 0.35,
        sharpness: 0,
        direction: 'level',
        articulation: 'normal',
      },
    }
  }

  const points = hands.flat()
  const rawCenter = averagePoint(hands.map(stableHandCenter))
  const center = previous
    ? {
        x: previous.center.x * 0.62 + rawCenter.x * 0.38,
        y: previous.center.y * 0.62 + rawCenter.y * 0.38,
      }
    : rawCenter
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const previousCenter = previous?.center ?? rawCenter
  const horizontalMotion = rawCenter.x - previousCenter.x
  const verticalMotion = previousCenter.y - rawCenter.y
  const seconds = Math.max(0.016, deltaMs / 1000)
  const distance = Math.hypot(horizontalMotion, verticalMotion)
  const speed = clamp01(distance / seconds / 2.8)
  const previousSpeed = previous?.features.speed ?? speed
  const smoothedSpeed = previous ? previousSpeed * 0.45 + speed * 0.55 : speed
  const sharpness = clamp01(Math.abs(smoothedSpeed - previousSpeed) * 2.2)
  const size = clamp01(Math.hypot(maxX - minX, maxY - minY) * 1.7)

  let direction: Direction = 'level'
  if (Math.abs(verticalMotion) > 0.018 || Math.abs(horizontalMotion) > 0.03) {
    direction =
      verticalMotion > Math.abs(horizontalMotion) * 0.45
        ? 'up'
        : verticalMotion < -Math.abs(horizontalMotion) * 0.45
          ? 'down'
          : 'level'
  }

  let articulation: Articulation = 'normal'
  if (sharpness > 0.48 || smoothedSpeed > 0.72) {
    articulation = 'staccato'
  } else if (smoothedSpeed < 0.18 && sharpness < 0.2) {
    articulation = 'legato'
  }

  return {
    center,
    rawCenter,
    features: {
      handCount: hands.length,
      height: clamp01(1 - center.y),
      speed: smoothedSpeed,
      horizontal: clamp01((horizontalMotion + 0.18) / 0.36),
      vertical: clamp01((verticalMotion + 0.18) / 0.36),
      size,
      sharpness,
      direction,
      articulation,
    },
  }
}
