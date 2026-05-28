const NOTE_TO_PC: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

const PC_TO_NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export function noteToMidi(note: string, octave = 4) {
  const pc = NOTE_TO_PC[note]
  if (pc === undefined) {
    throw new Error(`Unknown note: ${note}`)
  }

  return 12 * (octave + 1) + pc
}

export function midiToNote(midi: number) {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${PC_TO_NOTE[pc]}${octave}`
}

export function closestMidiForNote(note: string, targetMidi: number) {
  const targetOctave = Math.floor(targetMidi / 12) - 1
  const candidates = [targetOctave - 1, targetOctave, targetOctave + 1].map((octave) =>
    noteToMidi(note, octave),
  )

  return candidates.sort((a, b) => Math.abs(a - targetMidi) - Math.abs(b - targetMidi))[0]
}

export function noteNameFromMidi(midi: number) {
  return PC_TO_NOTE[((midi % 12) + 12) % 12]
}

export function clampMidiToRange(midi: number, min: number, max: number) {
  return Math.min(max, Math.max(min, midi))
}
