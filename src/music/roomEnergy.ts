import type { Point } from './gesture'
import type { Articulation, Direction, GestureFeatures } from './types'

export type RoomEnergyState = {
  crowdPresence: number
  roomMotion: number
  gestureSpread: number
  verticalEnergy: number
  activityScore: number
  tempo: number
  density: number
  drumIntensity: number
  rhythmIntensity: number
  bassActivity: number
  leadActivity: number
  activeLayers: string[]
  gesture: GestureFeatures
}

type HandSample = {
  center: Point
}

const PALM_LANDMARKS = [0, 5, 9, 13, 17]
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function averagePoint(points: Point[]) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function handCenter(hand: Point[]) {
  const palmPoints = PALM_LANDMARKS.map((index) => hand[index]).filter(Boolean)
  return averagePoint(palmPoints.length ? palmPoints : hand)
}

export class RoomEnergyAnalyzer {
  private previous: HandSample[] = []
  private activityScore = 0
  private vertical = 0

  update(hands: Point[][], baseTempo: number, sensitivity = 0.72): RoomEnergyState {
    const centers = hands.map(handCenter)
    const crowdPresence = hands.length
    const presenceScore = clamp01(crowdPresence / 6)
    const gestureSpread = this.calculateSpread(centers)
    const motionSamples = centers.map((center, index) => {
      const previous = this.previous[index]?.center ?? center
      return {
        distance: Math.hypot(center.x - previous.x, center.y - previous.y),
        vertical: previous.y - center.y,
      }
    })
    const rawMotion = motionSamples.length
      ? motionSamples.reduce((sum, sample) => sum + sample.distance, 0) / motionSamples.length
      : 0
    const rawVertical = motionSamples.length
      ? motionSamples.reduce((sum, sample) => sum + Math.abs(sample.vertical), 0) / motionSamples.length
      : 0
    const roomMotion = clamp01((rawMotion * 14 * (0.55 + sensitivity)) + presenceScore * 0.12)
    const verticalEnergy = clamp01(rawVertical * 16 * (0.55 + sensitivity))
    const targetActivity = clamp01(roomMotion * 0.58 + gestureSpread * 0.16 + presenceScore * 0.26)

    this.activityScore = this.activityScore * 0.78 + targetActivity * 0.22
    this.vertical = this.vertical * 0.7 + verticalEnergy * 0.3
    this.previous = centers.map((center) => ({ center }))

    const activityScore = clamp01(this.activityScore)
    const density = clamp01(0.18 + activityScore * 0.82)
    const tempo = Math.round(baseTempo + activityScore * 34)
    const direction = this.directionFromMotion(motionSamples)
    const articulation: Articulation = activityScore > 0.72 ? 'staccato' : activityScore < 0.22 ? 'legato' : 'normal'
    const activeLayers = [
      'drums',
      'bass',
      ...(activityScore > 0.12 ? ['rhythm guitar'] : []),
      ...(activityScore > 0.42 ? ['lead fills'] : []),
      ...(activityScore > 0.72 ? ['full band'] : []),
    ]

    return {
      crowdPresence,
      roomMotion,
      gestureSpread,
      verticalEnergy: this.vertical,
      activityScore,
      tempo,
      density,
      drumIntensity: clamp01(0.32 + activityScore * 0.68),
      rhythmIntensity: clamp01(0.18 + activityScore * 0.82),
      bassActivity: clamp01(0.38 + activityScore * 0.62),
      leadActivity: clamp01(Math.max(0, activityScore - 0.25) / 0.75),
      activeLayers,
      gesture: {
        handCount: crowdPresence,
        height: centers.length ? clamp01(1 - averagePoint(centers).y) : 0.48,
        speed: density,
        horizontal: 0.5,
        vertical: this.vertical,
        size: gestureSpread || 0.2,
        sharpness: activityScore,
        direction,
        articulation,
      },
    }
  }

  reset() {
    this.previous = []
    this.activityScore = 0
    this.vertical = 0
  }

  private calculateSpread(centers: Point[]) {
    if (centers.length < 2) return 0
    const xs = centers.map((center) => center.x)
    const ys = centers.map((center) => center.y)
    return clamp01(Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)))
  }

  private directionFromMotion(samples: Array<{ vertical: number }>): Direction {
    if (!samples.length) return 'level'
    const vertical = samples.reduce((sum, sample) => sum + sample.vertical, 0) / samples.length
    if (vertical > 0.012) return 'up'
    if (vertical < -0.012) return 'down'
    return 'level'
  }
}
