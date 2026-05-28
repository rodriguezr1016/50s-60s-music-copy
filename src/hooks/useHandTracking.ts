import { useEffect, useRef, useState, type RefObject } from 'react'
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { DEFAULT_GESTURE } from '../music/presets'
import { extractGestureFeatures, type GestureSnapshot, type Point } from '../music/gesture'
import type { GestureFeatures } from '../music/types'

type CameraStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unsupported' | 'error'

type TrackingState = {
  status: CameraStatus
  message: string
  gesture: GestureFeatures
  center: Point
  landmarks: Point[][]
}

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [state, setState] = useState<TrackingState>({
    status: 'idle',
    message: 'Camera is off',
    gesture: DEFAULT_GESTURE,
    center: { x: 0.5, y: 0.5 },
    landmarks: [],
  })
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const previousRef = useRef<GestureSnapshot | undefined>(undefined)
  const lastTimeRef = useRef(0)
  const frameRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(frameRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      queueMicrotask(() => {
        setState((current) => ({ ...current, status: 'idle', message: 'Camera is off', landmarks: [] }))
      })
      return
    }

    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState((current) => ({ ...current, status: 'unsupported', message: 'Camera unavailable in this browser' }))
        return
      }

      try {
        setState((current) => ({ ...current, status: 'loading', message: 'Loading hand tracker' }))
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        landmarkerRef.current =
          landmarkerRef.current ??
          (await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 8,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }))

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        lastTimeRef.current = performance.now()
        setState((current) => ({ ...current, status: 'ready', message: 'Tracking hands' }))
        loop()
      } catch (error) {
        const name = error instanceof DOMException ? error.name : ''
        setState((current) => ({
          ...current,
          status: name === 'NotAllowedError' ? 'denied' : 'error',
          message: name === 'NotAllowedError' ? 'Camera permission denied' : 'Could not start camera tracking',
        }))
      }
    }

    function loop() {
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (!video || !landmarker || cancelled) return

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const now = performance.now()
        const delta = now - lastTimeRef.current
        lastTimeRef.current = now
        const results = landmarker.detectForVideo(video, now)
        const landmarks = results.landmarks.map((hand) =>
          hand.map((point) => ({ x: point.x, y: point.y, z: point.z })),
        )
        const snapshot = extractGestureFeatures(landmarks, previousRef.current, delta)
        previousRef.current = snapshot
        setState({
          status: 'ready',
          message: landmarks.length ? `${landmarks.length} hand${landmarks.length > 1 ? 's' : ''} tracked` : 'Show one or both hands',
          gesture: snapshot.features,
          center: snapshot.rawCenter,
          landmarks,
        })
      }

      frameRef.current = requestAnimationFrame(loop)
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(frameRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [enabled, videoRef])

  return state
}
