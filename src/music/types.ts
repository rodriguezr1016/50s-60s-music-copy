export type StyleId = 'dooWop' | 'surfRock' | 'motown'

export type Direction = 'up' | 'down' | 'level'

export type Articulation = 'legato' | 'normal' | 'staccato'

export type GestureFeatures = {
  handCount: number
  height: number
  speed: number
  horizontal: number
  vertical: number
  size: number
  sharpness: number
  direction: Direction
  articulation: Articulation
}

export type RhythmValue = '16n' | '8n' | '4n' | '2n'

export type Chord = {
  label: string
  notes: string[]
}

export type StylePreset = {
  id: StyleId
  name: string
  key: string
  scale: string[]
  chromatic: string[]
  chords: Chord[]
  progressionName: string
  rhythmBias: RhythmValue[]
  rhythmTemplates: RhythmValue[][]
  instruments: string[]
  mood: string
}

export type MelodyEvent = {
  note: string
  midi: number
  duration: RhythmValue
  velocity: number
  articulation: Articulation
  chord: Chord
  motif: string[]
  harmony?: string
  role: 'lead' | 'response'
}
