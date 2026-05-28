import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, Circle, Gauge, Hand, Music2, Play, Square, Waves } from 'lucide-react'
import './App.css'
import { EraBand, type BandLoadReport } from './audio/eraBand'
import { useHandTracking } from './hooks/useHandTracking'
import { MelodyEngine, secondsForRhythm } from './music/melodyEngine'
import { STYLE_PRESETS } from './music/presets'
import type { Point } from './music/gesture'
import { RoomEnergyAnalyzer, type RoomEnergyState } from './music/roomEnergy'
import type { MelodyEvent, StyleId } from './music/types'

const styles = Object.values(STYLE_PRESETS)

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function baselineRoomState(baseTempo: number): RoomEnergyState {
  return new RoomEnergyAnalyzer().update([], baseTempo)
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bandRef = useRef(new EraBand())
  const timerRef = useRef<number | null>(null)
  const landmarksRef = useRef<Point[][]>([])
  const tempoRef = useRef(116)
  const engineRef = useRef(new MelodyEngine(STYLE_PRESETS.dooWop))
  const roomAnalyzerRef = useRef(new RoomEnergyAnalyzer())
  const sensitivityRef = useRef(0.72)
  const roomStateRef = useRef<RoomEnergyState>(baselineRoomState(116))
  const [styleId, setStyleId] = useState<StyleId>('dooWop')
  const [tempo, setTempo] = useState(116)
  const [sensitivity, setSensitivity] = useState(0.72)
  const [isPerforming, setIsPerforming] = useState(false)
  const [currentEvent, setCurrentEvent] = useState<MelodyEvent | null>(null)
  const [roomState, setRoomState] = useState<RoomEnergyState>(() => baselineRoomState(116))
  const [audioStatus, setAudioStatus] = useState('Tap play to start the band')
  const [loadReport, setLoadReport] = useState<BandLoadReport | null>(null)
  const preset = STYLE_PRESETS[styleId]
  const tracking = useHandTracking(videoRef, isPerforming)

  useEffect(() => {
    tempoRef.current = tempo
  }, [tempo])

  useEffect(() => {
    engineRef.current.setPreset(preset)
  }, [preset])

  useEffect(() => {
    sensitivityRef.current = sensitivity
  }, [sensitivity])

  useEffect(() => {
    landmarksRef.current = tracking.landmarks
  }, [tracking.landmarks])

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const context = canvas.getContext('2d')
    if (!context) return

    const width = video.clientWidth || 960
    const height = video.clientHeight || 540
    const pixelRatio = window.devicePixelRatio || 1
    canvas.width = width * pixelRatio
    canvas.height = height * pixelRatio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.fillStyle = 'rgba(255, 248, 225, 0.9)'
    context.strokeStyle = 'rgba(255, 248, 225, 0.76)'
    context.lineWidth = 2
    const videoWidth = video.videoWidth || width
    const videoHeight = video.videoHeight || height
    const coverScale = Math.max(width / videoWidth, height / videoHeight)
    const renderedWidth = videoWidth * coverScale
    const renderedHeight = videoHeight * coverScale
    const offsetX = (width - renderedWidth) / 2
    const offsetY = (height - renderedHeight) / 2
    const toCanvasPoint = (point: { x: number; y: number }) => ({
      x: offsetX + point.x * renderedWidth,
      y: offsetY + point.y * renderedHeight,
    })

    tracking.landmarks.forEach((handLandmarks) => {
      handLandmarks.forEach((point) => {
        const canvasPoint = toCanvasPoint(point)
        context.beginPath()
        context.arc(canvasPoint.x, canvasPoint.y, 4, 0, Math.PI * 2)
        context.fill()
      })

      const palm = handLandmarks[9] ?? handLandmarks[0]
      if (palm) {
        const canvasPalm = toCanvasPoint(palm)
        context.beginPath()
        context.arc(
          canvasPalm.x,
          canvasPalm.y,
          18 + tracking.gesture.size * 28,
          0,
          Math.PI * 2,
        )
        context.stroke()
      }
    })
  }, [tracking.gesture.size, tracking.landmarks])

  useEffect(() => {
    const band = bandRef.current
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      band.dispose()
    }
  }, [])

  async function startPerformance() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setAudioStatus('Loading guitar samples...')
    const report = await bandRef.current.start(styleId)
    setLoadReport(report)
    setAudioStatus(report.ready ? 'Room band playing' : 'Room band playing; some samples are missing')
    setIsPerforming(true)
    roomAnalyzerRef.current.reset()

    const tick = () => {
      const room = roomAnalyzerRef.current.update(landmarksRef.current, tempoRef.current, sensitivityRef.current)
      roomStateRef.current = room
      setRoomState(room)
      const event = engineRef.current.next(room.gesture)
      const seconds = secondsForRhythm(event.duration, room.tempo)
      bandRef.current.playStep(event, seconds, room.tempo, room)
      setCurrentEvent(event)
      timerRef.current = window.setTimeout(tick, seconds * 1000)
    }

    tick()
  }

  function stopPerformance() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    roomAnalyzerRef.current.reset()
    const baseline = baselineRoomState(tempoRef.current)
    roomStateRef.current = baseline
    setRoomState(baseline)
    bandRef.current.dispose()
    setIsPerforming(false)
    setAudioStatus('Band stopped')
  }

  async function handleStyleChange(nextStyle: StyleId) {
    setStyleId(nextStyle)
    engineRef.current.setPreset(STYLE_PRESETS[nextStyle])
    if (isPerforming) {
      setAudioStatus('Loading guitar samples...')
      const report = await bandRef.current.start(nextStyle)
      setLoadReport(report)
      roomAnalyzerRef.current.reset()
      setAudioStatus(
        report.ready
          ? `Switched to ${STYLE_PRESETS[nextStyle].name}`
          : `Switched to ${STYLE_PRESETS[nextStyle].name}; some samples are missing`,
      )
    }
  }

  return (
    <main className="app-shell">
      <section className="stage" aria-label="Gesture performance stage">
        <div className="video-wrap">
          <video ref={videoRef} className="camera-feed" playsInline muted aria-label="Live camera feed" />
          <canvas ref={canvasRef} className="landmark-layer" aria-hidden="true" />
          {!isPerforming && (
            <div className="camera-idle">
              <Camera aria-hidden="true" />
              <span>Gesture Melody</span>
            </div>
          )}
          <div className="stage-hud">
            <span className={`status-dot ${isPerforming ? 'on' : ''}`} />
            <span>{tracking.message}</span>
          </div>
        </div>

        <aside className="control-surface" aria-label="Performance controls">
          <div className="brand-row">
            <Music2 aria-hidden="true" />
            <div>
              <h1>50s/60s Gesture Melody</h1>
              <p>{preset.mood}</p>
            </div>
          </div>

          <div className="transport-row">
            <button type="button" className="transport play" onClick={startPerformance} disabled={isPerforming}>
              <Play aria-hidden="true" />
              <span>Play</span>
            </button>
            <button type="button" className="transport stop" onClick={stopPerformance} disabled={!isPerforming}>
              <Square aria-hidden="true" />
              <span>Stop</span>
            </button>
          </div>

          <div className="field">
            <label htmlFor="style">Style</label>
            <select
              id="style"
              value={styleId}
              onChange={(event) => void handleStyleChange(event.target.value as StyleId)}
            >
              {styles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tempo">
              <Gauge aria-hidden="true" />
              Base tempo <strong>{tempo}</strong>
            </label>
            <input
              id="tempo"
              type="range"
              min="72"
              max="176"
              value={tempo}
              onChange={(event) => {
                const nextTempo = Number(event.target.value)
                setTempo(nextTempo)
                if (!isPerforming) {
                  const baseline = baselineRoomState(nextTempo)
                  roomStateRef.current = baseline
                  setRoomState(baseline)
                }
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="sensitivity">
              <Waves aria-hidden="true" />
              Sensitivity <strong>{Math.round(sensitivity * 100)}</strong>
            </label>
            <input
              id="sensitivity"
              type="range"
              min="0.35"
              max="1"
              step="0.01"
              value={sensitivity}
              onChange={(event) => setSensitivity(Number(event.target.value))}
            />
          </div>

          <div className="readout-grid">
            <Readout
              icon={<Hand />}
              label="Room"
              value={`${roomState.crowdPresence} tracked hand${roomState.crowdPresence === 1 ? '' : 's'} - ${roomState.activeLayers.join(', ')}`}
            />
            <Readout
              icon={<Circle />}
              label="Chord"
              value={`${currentEvent?.chord.label ?? preset.chords[0].label} - ${preset.progressionName}`}
            />
            <Readout icon={<Music2 />} label="Loop" value={currentEvent?.motif.join('  ') ?? 'band warming up'} />
          </div>

          <div className="meter-bank" aria-label="Room energy meters">
            <Meter label="Energy" value={roomState.activityScore} />
            <Meter label="Motion" value={roomState.roomMotion} />
            <Meter label="Spread" value={roomState.gestureSpread} />
            <Meter label="Tempo" value={Math.min(1, roomState.tempo / 190)} />
          </div>

          <div className="instrument-list">
            {preset.instruments.map((instrument) => (
              <span key={instrument}>{instrument}</span>
            ))}
          </div>

          <p className="audio-status">{audioStatus}</p>
          {loadReport && (
            <div className="sample-report" aria-label="SoundFont load report">
              {loadReport.instruments.map((instrument) => (
                <span className={instrument.missingProbes.length ? 'warn' : 'ok'} key={instrument.role}>
                  {instrument.role}: {instrument.sampleCount} samples
                </span>
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}

function Readout({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="readout">
      <div className="readout-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  )
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <span>{label}</span>
      <div className="meter-track">
        <i style={{ width: percent(value) }} />
      </div>
      <b>{percent(value)}</b>
    </div>
  )
}

export default App
