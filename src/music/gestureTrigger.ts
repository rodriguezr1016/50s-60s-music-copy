import type { Point } from './gesture'
import type { Direction } from './types'

export type GestureTriggerType = 'swipe' | 'circle'

export type GestureTrigger = {
  type: GestureTriggerType
  direction: Direction
  phraseLength: number
}

type GestureSample = {
  center: Point
  time: number
}

export class GestureTriggerDetector {
  private samples: GestureSample[] = []
  private cooldownUntil = 0

  update(handCount: number, center: Point, time = performance.now()): GestureTrigger | null {
    if (handCount < 1) {
      this.samples = []
      return null
    }

    this.samples.push({ center, time })
    this.samples = this.samples.filter((sample) => time - sample.time <= 900).slice(-34)

    if (time < this.cooldownUntil || this.samples.length < 6) {
      return null
    }

    const circle = this.detectCircle()
    if (circle) {
      this.cooldownUntil = time + 1200
      this.samples = []
      return circle
    }

    const swipe = this.detectSwipe()
    if (swipe) {
      this.cooldownUntil = time + 850
      this.samples = []
      return swipe
    }

    return null
  }

  reset() {
    this.samples = []
    this.cooldownUntil = 0
  }

  private detectSwipe(): GestureTrigger | null {
    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    const duration = Math.max(1, last.time - first.time)
    const dx = last.center.x - first.center.x
    const dy = last.center.y - first.center.y
    const distance = Math.hypot(dx, dy)
    const speed = distance / (duration / 1000)
    let turn = 0
    for (let index = 2; index < this.samples.length; index += 1) {
      const a = this.samples[index - 2].center
      const b = this.samples[index - 1].center
      const c = this.samples[index].center
      const previousAngle = Math.atan2(b.y - a.y, b.x - a.x)
      const currentAngle = Math.atan2(c.y - b.y, c.x - b.x)
      let delta = currentAngle - previousAngle
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      turn += Math.abs(delta)
    }

    if (duration > 720 || distance < 0.1 || speed < 0.24 || turn > 0.7) {
      return null
    }

    const direction =
      Math.abs(dy) > Math.abs(dx) * 0.75 ? (dy < 0 ? 'up' : 'down') : dx > 0 ? 'up' : 'down'

    return {
      type: 'swipe',
      direction,
      phraseLength: 5,
    }
  }

  private detectCircle(): GestureTrigger | null {
    if (this.samples.length < 14) return null

    const recent = this.samples.slice(-24)
    const center = {
      x: recent.reduce((sum, sample) => sum + sample.center.x, 0) / recent.length,
      y: recent.reduce((sum, sample) => sum + sample.center.y, 0) / recent.length,
    }
    const radii = recent.map((sample) => Math.hypot(sample.center.x - center.x, sample.center.y - center.y))
    const averageRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length
    const radiusVariance =
      radii.reduce((sum, radius) => sum + Math.abs(radius - averageRadius), 0) / radii.length

    if (averageRadius < 0.035 || radiusVariance > averageRadius * 0.9) {
      return null
    }

    let angleTravel = 0
    for (let index = 1; index < recent.length; index += 1) {
      const previous = Math.atan2(recent[index - 1].center.y - center.y, recent[index - 1].center.x - center.x)
      const current = Math.atan2(recent[index].center.y - center.y, recent[index].center.x - center.x)
      let delta = current - previous
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      angleTravel += delta
    }

    if (Math.abs(angleTravel) < Math.PI * 1.1) {
      return null
    }

    return {
      type: 'circle',
      direction: angleTravel < 0 ? 'up' : 'down',
      phraseLength: 8,
    }
  }
}
