import { instrument, type Player } from 'soundfont-player'
import { midiToNote } from '../music/notes'
import type { RoomEnergyState } from '../music/roomEnergy'
import type { MelodyEvent, StyleId } from '../music/types'

type BandNodes = {
  master: GainNode
  leadBus: GainNode
  rhythmBus: GainNode
  bassBus: GainNode
  drumBus: GainNode
  delay: DelayNode
  delayReturn: GainNode
  feedback: GainNode
  leadFilter: BiquadFilterNode
  rhythmFilter: BiquadFilterNode
  bassFilter: BiquadFilterNode
  masterFilter: BiquadFilterNode
  tape: WaveShaperNode
  }

type PlayerWithBuffers = Player & {
  buffers?: Record<string, AudioBuffer>
  name?: string
  url?: string
}

export type BandLoadReport = {
  ready: boolean
  instruments: Array<{
    role: string
    name: string
    sampleCount: number
    missingProbes: string[]
  }>
}

export class EraBand {
  private context?: AudioContext
  private nodes?: BandNodes
  private lead?: PlayerWithBuffers
  private rhythmGuitar?: PlayerWithBuffers
  private bass?: PlayerWithBuffers
  private activeNodes: AudioNode[] = []
  private beat = 0
  private style: StyleId = 'dooWop'

  async start(style: StyleId): Promise<BandLoadReport> {
    this.dispose()
    this.style = style
    this.context = new AudioContext()
    await this.context.resume()
    this.nodes = this.createNodes(this.context, style)

    const common = {
      soundfont: 'MusyngKite',
      format: 'mp3',
      attack: 0.002,
      decay: 0.08,
      sustain: 0.62,
      release: 0.18,
    }

    const leadName = style === 'surfRock' ? 'electric_guitar_clean' : 'electric_guitar_jazz'
    const bassName = style === 'surfRock' ? 'electric_bass_pick' : 'electric_bass_finger'

    const [lead, rhythmGuitar, bass] = await Promise.all([
      instrument(this.context, leadName, {
        ...common,
        destination: this.nodes.leadBus,
        gain: style === 'surfRock' ? 0.82 : 0.74,
      }),
      instrument(this.context, 'electric_guitar_muted', {
        ...common,
        destination: this.nodes.rhythmBus,
        gain: style === 'motown' ? 0.48 : 0.58,
        release: 0.08,
      }),
      instrument(this.context, bassName, {
        ...common,
        destination: this.nodes.bassBus,
        gain: 0.82,
        release: 0.14,
      }),
    ])

    this.lead = lead as PlayerWithBuffers
    this.rhythmGuitar = rhythmGuitar as PlayerWithBuffers
    this.bass = bass as PlayerWithBuffers

    return this.createLoadReport()
  }

  playStep(event: MelodyEvent, seconds: number, tempo: number, room: RoomEnergyState) {
    if (!this.context || !this.nodes || !this.lead || !this.rhythmGuitar || !this.bass) return

    const now = this.context.currentTime
    const humanTime = now + (Math.random() - 0.5) * 0.018
    this.applyRoomMix(room, now)
    const noteLength =
      event.articulation === 'staccato'
        ? seconds * 0.32
        : event.articulation === 'legato'
          ? seconds * 0.86
          : seconds * 0.58
    const leadGain = Math.min(0.95, event.velocity * (0.35 + room.leadActivity * 0.8))
    const shouldPlayLead = room.leadActivity > 0.18 || this.beat % 8 === 0

    if (shouldPlayLead) {
      this.safePlay(
        this.lead,
        event.note,
        humanTime,
        {
          duration: noteLength,
          gain: leadGain,
          attack: event.articulation === 'staccato' ? 0.001 : 0.004,
          release: event.articulation === 'legato' ? 0.24 : 0.1,
        },
      )
    }

    if (event.harmony && event.role === 'response' && room.leadActivity > 0.48) {
      this.safePlay(this.lead, midiToNote(event.midi - 5), humanTime + 0.015, {
          duration: noteLength * 0.75,
          gain: leadGain * 0.38,
          release: 0.12,
        })
    }

    if (this.shouldStrum(room)) {
      this.strumChord(event, humanTime, seconds, room)
    }

    if (this.beat % 2 === 0 || (room.bassActivity > 0.72 && this.beat % 4 === 3)) {
      const rootMidi = this.bassMidiFor(this.bassNoteForStep(event))
      this.safePlay(this.bass, midiToNote(rootMidi), humanTime + 0.006, {
          duration: Math.min(seconds * 0.72, 0.34),
          gain: 0.48 + room.bassActivity * 0.34,
          release: 0.12,
        })
    }

    this.playKit(humanTime, tempo, room)
    this.activeNodes = this.activeNodes.slice(-80)
    this.beat += 1
  }

  play(event: MelodyEvent, seconds: number, tempo: number) {
    this.playStep(event, seconds, tempo, {
      crowdPresence: 0,
      roomMotion: 0,
      gestureSpread: 0,
      verticalEnergy: 0,
      activityScore: 0.3,
      tempo,
      density: 0.4,
      drumIntensity: 0.5,
      rhythmIntensity: 0.5,
      bassActivity: 0.55,
      leadActivity: 0.35,
      activeLayers: ['drums', 'bass', 'rhythm guitar'],
      gesture: {
        handCount: 0,
        height: 0.5,
        speed: 0.4,
        horizontal: 0.5,
        vertical: 0,
        size: 0.3,
        sharpness: 0.2,
        direction: 'level',
        articulation: 'normal',
      },
    })
  }

  dispose() {
    this.lead?.stop()
    this.rhythmGuitar?.stop()
    this.bass?.stop()
    this.activeNodes = []
    this.context?.close()
    this.context = undefined
    this.nodes = undefined
    this.lead = undefined
    this.rhythmGuitar = undefined
    this.bass = undefined
    this.beat = 0
  }

  private createNodes(context: AudioContext, style: StyleId): BandNodes {
    const master = context.createGain()
    const leadBus = context.createGain()
    const rhythmBus = context.createGain()
    const bassBus = context.createGain()
    const drumBus = context.createGain()
    const delay = context.createDelay(1)
    const delayReturn = context.createGain()
    const feedback = context.createGain()
    const leadFilter = context.createBiquadFilter()
    const rhythmFilter = context.createBiquadFilter()
    const bassFilter = context.createBiquadFilter()
    const masterFilter = context.createBiquadFilter()
    const tape = context.createWaveShaper()

    master.gain.value = style === 'motown' ? 0.82 : 0.76
    leadBus.gain.value = style === 'surfRock' ? 0.86 : 0.78
    rhythmBus.gain.value = style === 'motown' ? 0.45 : 0.56
    bassBus.gain.value = 0.76
    drumBus.gain.value = 0.5
    delay.delayTime.value = style === 'surfRock' ? 0.145 : style === 'dooWop' ? 0.11 : 0.085
    delayReturn.gain.value = style === 'surfRock' ? 0.28 : style === 'dooWop' ? 0.16 : 0.07
    feedback.gain.value = style === 'surfRock' ? 0.32 : style === 'dooWop' ? 0.12 : 0.05

    leadFilter.type = 'lowpass'
    leadFilter.frequency.value = style === 'surfRock' ? 3600 : style === 'dooWop' ? 2400 : 2100
    rhythmFilter.type = 'lowpass'
    rhythmFilter.frequency.value = style === 'surfRock' ? 2500 : style === 'motown' ? 1350 : 1900
    bassFilter.type = 'lowpass'
    bassFilter.frequency.value = style === 'motown' ? 680 : 820
    masterFilter.type = 'lowpass'
    masterFilter.frequency.value = style === 'surfRock' ? 5200 : style === 'dooWop' ? 4100 : 3600
    tape.curve = this.createTapeCurve(style === 'surfRock' ? 1.8 : style === 'motown' ? 2.6 : 2.1)
    tape.oversample = '2x'

    leadBus.connect(leadFilter)
    leadFilter.connect(master)
    leadFilter.connect(delay)
    rhythmBus.connect(rhythmFilter)
    rhythmFilter.connect(master)
    rhythmFilter.connect(delay)
    bassBus.connect(bassFilter)
    bassFilter.connect(master)
    drumBus.connect(master)
    delay.connect(delayReturn)
    delay.connect(feedback)
    feedback.connect(delay)
    delayReturn.connect(master)
    master.connect(tape)
    tape.connect(masterFilter)
    masterFilter.connect(context.destination)

    return {
      master,
      leadBus,
      rhythmBus,
      bassBus,
      drumBus,
      delay,
      delayReturn,
      feedback,
      leadFilter,
      rhythmFilter,
      bassFilter,
      masterFilter,
      tape,
    }
  }

  private strumChord(event: MelodyEvent, time: number, seconds: number, room: RoomEnergyState) {
    if (!this.rhythmGuitar) return

    const octave = this.style === 'surfRock' ? 3 : this.style === 'dooWop' ? 4 : 3
    const notes = event.chord.notes.slice(0, 3).map((note) => this.noteToMidi(note, octave))
    const strumGap = this.style === 'motown' ? 0.02 : this.style === 'surfRock' ? 0.008 : 0.015
    notes.forEach((note, index) => {
      this.safePlay(this.rhythmGuitar!, midiToNote(note), time + index * strumGap, {
          duration: Math.min(seconds * 0.3, 0.18),
          gain: (this.style === 'motown' ? 0.26 : 0.32) + room.rhythmIntensity * 0.22,
          release: 0.06,
        })
    })
  }

  private shouldStrum(room: RoomEnergyState) {
    if (this.style === 'dooWop') return this.beat % 4 === 0 || (room.rhythmIntensity > 0.65 && this.beat % 4 === 2)
    if (this.style === 'motown') return this.beat % 4 === 1 || this.beat % 4 === 3 || room.rhythmIntensity > 0.78
    if (room.rhythmIntensity > 0.72) return true
    if (room.rhythmIntensity > 0.38) return this.beat % 2 === 0
    return this.beat % 4 === 0
  }

  private applyRoomMix(room: RoomEnergyState, time: number) {
    if (!this.nodes) return
    const styleLeadTrim = this.style === 'dooWop' ? 0.72 : this.style === 'motown' ? 0.62 : 1
    this.nodes.leadBus.gain.setTargetAtTime((0.18 + room.leadActivity * 0.76) * styleLeadTrim, time, 0.08)
    this.nodes.rhythmBus.gain.setTargetAtTime(0.2 + room.rhythmIntensity * (this.style === 'motown' ? 0.38 : 0.5), time, 0.08)
    this.nodes.bassBus.gain.setTargetAtTime((this.style === 'motown' ? 0.58 : 0.46) + room.bassActivity * 0.34, time, 0.08)
    this.nodes.drumBus.gain.setTargetAtTime((this.style === 'dooWop' ? 0.18 : 0.3) + room.drumIntensity * 0.46, time, 0.06)
    this.nodes.delayReturn.gain.setTargetAtTime(
      (this.style === 'surfRock' ? 0.14 : 0.08) + room.activityScore * 0.14,
      time,
      0.1,
    )
  }

  private safePlay(player: PlayerWithBuffers, note: string, time: number, options: Record<string, number>) {
    const node = player.play(note, time, options) as unknown as AudioNode | undefined
    if (node) {
      this.activeNodes.push(node)
    }
  }

  private createLoadReport(): BandLoadReport {
    const instruments = [
      this.inspectInstrument('lead guitar', this.lead, ['C4', 'E4', 'G4', 'A4']),
      this.inspectInstrument('rhythm guitar', this.rhythmGuitar, ['C4', 'E4', 'G4', 'A4']),
      this.inspectInstrument('bass', this.bass, ['C2', 'E2', 'G2', 'A2']),
    ]

    return {
      ready: instruments.every((item) => item.sampleCount > 0 && item.missingProbes.length === 0),
      instruments,
    }
  }

  private inspectInstrument(role: string, player?: PlayerWithBuffers, probes: string[] = []) {
    const buffers = player?.buffers ?? {}
    const sampleKeys = Object.keys(buffers)
    const missingProbes = probes.filter((probe) => !buffers[String(this.noteNameToMidi(probe))])

    return {
      role,
      name: player?.name ?? 'not loaded',
      sampleCount: sampleKeys.length,
      missingProbes,
    }
  }

  private playKit(time: number, tempo: number, room: RoomEnergyState) {
    if (!this.context || !this.nodes) return

    if (this.beat % 4 === 0 || (this.style === 'motown' && room.bassActivity > 0.7 && this.beat % 4 === 3)) {
      this.playKick(time, room.drumIntensity)
    }

    const snareBeat = this.style === 'motown' ? this.beat % 4 === 2 : this.style === 'dooWop' ? this.beat % 8 === 4 : this.beat % 4 === 2
    if (snareBeat) {
      this.playSnare(time + Math.min(0.018, 60 / tempo / 12), room.drumIntensity)
    }

    if (this.style !== 'dooWop' && room.drumIntensity > 0.72 && this.beat % 2 === 1) {
      this.playSnare(time + 0.01, room.drumIntensity * 0.42)
    }
  }

  private playKick(time: number, intensity = 0.5) {
    if (!this.context || !this.nodes) return

    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(120, time)
    oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.12)
    gain.gain.setValueAtTime(0.32 + intensity * 0.42, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14)
    oscillator.connect(gain)
    gain.connect(this.nodes.drumBus)
    oscillator.start(time)
    oscillator.stop(time + 0.16)
  }

  private playSnare(time: number, intensity = 0.5) {
    if (!this.context || !this.nodes) return

    const noiseLength = 0.08
    const bufferSize = Math.max(1, Math.floor(this.context.sampleRate * noiseLength))
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < bufferSize; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize)
    }

    const noise = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    noise.buffer = buffer
    filter.type = 'highpass'
    filter.frequency.value = 1400
    gain.gain.setValueAtTime(0.12 + intensity * 0.24, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + noiseLength)
    noise.connect(filter)
    filter.connect(gain)
    gain.connect(this.nodes.drumBus)
    noise.start(time)
  }

  private bassMidiFor(note: string) {
    return this.noteToMidi(note, 2)
  }

  private bassNoteForStep(event: MelodyEvent) {
    const root = event.chord.notes[0]
    const fifth = event.chord.notes[2] ?? root

    if (this.style === 'dooWop') {
      return this.beat % 4 === 2 ? fifth : root
    }

    if (this.style === 'motown') {
      return this.beat % 4 === 3 ? fifth : this.beat % 4 === 1 ? event.chord.notes[1] ?? root : root
    }

    return this.beat % 4 === 2 ? fifth : root
  }

  private noteToMidi(note: string, octave: number) {
    const pitchClasses: Record<string, number> = {
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
    return 12 * (octave + 1) + pitchClasses[note]
  }

  private createTapeCurve(amount: number) {
    const samples = 1024
    const curve = new Float32Array(samples)
    for (let index = 0; index < samples; index += 1) {
      const x = (index * 2) / samples - 1
      curve[index] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
    }
    return curve
  }

  private noteNameToMidi(noteName: string) {
    const match = /^([A-G](?:#|b)?)(-?\d+)$/.exec(noteName)
    if (!match) return -1
    return this.noteToMidi(match[1], Number(match[2]))
  }
}
