import { describe, expect, it } from 'vitest'
import { MelodyEngine } from './melodyEngine'
import { noteNameFromMidi } from './notes'
import { DEFAULT_GESTURE, STYLE_PRESETS } from './presets'
import type { GestureFeatures, StylePreset } from './types'

const steadyRandom = () => 0.2

function gesture(overrides: Partial<GestureFeatures> = {}): GestureFeatures {
  return { ...DEFAULT_GESTURE, ...overrides }
}

function allowedNotesFor(preset: StylePreset, sharp = false) {
  return new Set([
    ...preset.scale,
    ...preset.chords.flatMap((chord) => chord.notes),
    ...(sharp ? preset.chromatic : []),
  ])
}

describe('MelodyEngine', () => {
  it('keeps generated notes inside the active style grammar', () => {
    Object.values(STYLE_PRESETS).forEach((preset) => {
      const engine = new MelodyEngine(preset, steadyRandom)
      const allowed = allowedNotesFor(preset)

      for (let index = 0; index < 16; index += 1) {
        const event = engine.next(gesture())
        expect(allowed.has(noteNameFromMidi(event.midi))).toBe(true)
      }
    })
  })

  it('turns faster gestures into denser rhythms', () => {
    const engine = new MelodyEngine(STYLE_PRESETS.motown, steadyRandom)

    const slow = engine.next(gesture({ speed: 0.04, articulation: 'legato' }))
    const medium = engine.next(gesture({ speed: 0.5 }))
    const fast = engine.next(gesture({ speed: 0.9, articulation: 'staccato' }))

    expect(['2n', '4n', '8n']).toContain(slow.duration)
    expect(['16n', '8n']).toContain(medium.duration)
    expect(['16n', '8n']).toContain(fast.duration)
  })

  it('biases upward gestures above downward gestures', () => {
    const upEngine = new MelodyEngine(STYLE_PRESETS.dooWop, steadyRandom)
    const downEngine = new MelodyEngine(STYLE_PRESETS.dooWop, steadyRandom)

    const upNotes = Array.from({ length: 8 }, () =>
      upEngine.next(gesture({ direction: 'up', speed: 0.76, height: 0.55 })).midi,
    )
    const downNotes = Array.from({ length: 8 }, () =>
      downEngine.next(gesture({ direction: 'down', speed: 0.76, height: 0.55 })).midi,
    )

    const upAverage = upNotes.reduce((sum, note) => sum + note, 0) / upNotes.length
    const downAverage = downNotes.reduce((sum, note) => sum + note, 0) / downNotes.length

    expect(upAverage).toBeGreaterThan(downAverage)
  })

  it('uses sharp two-handed gestures for accented harmony and staccato phrasing', () => {
    const engine = new MelodyEngine(STYLE_PRESETS.surfRock, steadyRandom)
    const event = engine.next(
      gesture({
        handCount: 2,
        speed: 0.92,
        size: 0.85,
        sharpness: 0.9,
        articulation: 'staccato',
      }),
    )

    expect(event.articulation).toBe('staccato')
    expect(event.velocity).toBeGreaterThan(0.8)
    expect(event.harmony).toBeDefined()
  })

  it('uses each preset rhythm templates for idiomatic phrase shape', () => {
    const dooWop = new MelodyEngine(STYLE_PRESETS.dooWop, steadyRandom)
    const surf = new MelodyEngine(STYLE_PRESETS.surfRock, () => 0.5)
    const motown = new MelodyEngine(STYLE_PRESETS.motown, steadyRandom)

    const dooDurations = Array.from({ length: 4 }, () => dooWop.next(gesture()).duration)
    const surfDurations = Array.from({ length: 4 }, () =>
      surf.next(gesture({ speed: 0.7, articulation: 'staccato' })).duration,
    )
    const motownDurations = Array.from({ length: 4 }, () => motown.next(gesture({ speed: 0.55 })).duration)

    expect(dooDurations).toEqual(['4n', '8n', '4n', '8n'])
    expect(surfDurations).toContain('16n')
    expect(motownDurations).toContain('16n')
  })

  it('resolves motif endings to chord tones', () => {
    const engine = new MelodyEngine(STYLE_PRESETS.dooWop, steadyRandom)
    const events = Array.from({ length: 4 }, () => engine.next(gesture()))
    const finalEvent = events[events.length - 1]

    expect(finalEvent.chord.notes).toContain(noteNameFromMidi(finalEvent.midi))
  })
})
