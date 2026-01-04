import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

import type {
  Metadata,
  SessionMode,
  ChantingDuration,
  MeditationDuration,
  InstructionType,
  SessionPhase,
  SessionConfig
} from './types'

import { useWakeLock } from './hooks/useWakeLock'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useMeditationTimer } from './hooks/useMeditationTimer'

import { selectChantingWithRetry } from './utils/chanting'
import { getAudioForPhase, getNextPhase, getFirstPhase } from './utils/phase'

import { SessionSetup } from './components/SessionSetup'
import { SessionActive } from './components/SessionActive'
import { SessionComplete } from './components/SessionComplete'

function App() {
  // Metadata
  const [metadata, setMetadata] = useState<Metadata | null>(null)

  // User settings (persisted in setup screen)
  const [sessionMode, setSessionMode] = useState<SessionMode>('custom')
  const [enableGong, setEnableGong] = useState(false)
  const [introDuration, setIntroDuration] = useState<ChantingDuration>('5min')
  const [meditationDuration, setMeditationDuration] = useState<MeditationDuration>(30)
  const [outroDuration, setOutroDuration] = useState<ChantingDuration>('5min')
  const [instructionType, setInstructionType] = useState<InstructionType>('short')

  // Session state
  const [phase, setPhase] = useState<SessionPhase>('idle')
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null)

  // Refs for async callbacks
  const phaseRef = useRef<SessionPhase>('idle')
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // Hooks
  const { request: requestWakeLock } = useWakeLock(phase)
  const { controls: audioControls, progress: audioProgress, timeRemaining: audioTimeRemaining } = useAudioPlayer()

  const handleMeditationComplete = useCallback(() => {
    if (phaseRef.current === 'meditation') {
      setPhase(getNextPhase('meditation', sessionConfig))
    }
  }, [sessionConfig])

  const { controls: timerControls, timeRemaining: meditationTimeRemaining } = useMeditationTimer(handleMeditationComplete)

  // Load metadata
  useEffect(() => {
    fetch('/audio/metadata.json')
      .then(res => res.json())
      .then(data => setMetadata(data))
      .catch(err => console.error('Failed to load metadata:', err))
  }, [])

  // Prepare session config - selects all audio files upfront
  const prepareSessionConfig = useCallback((): SessionConfig | null => {
    let introFile: string | null = null
    let outroFile: string | null = null

    if (sessionMode === 'custom') {
      if (introDuration !== 'none') {
        introFile = selectChantingWithRetry(metadata, introDuration)
        if (!introFile) {
          console.error('No intro chanting available for', introDuration)
          return null
        }
      }

      if (outroDuration !== 'none') {
        outroFile = selectChantingWithRetry(metadata, outroDuration)
        if (!outroFile) {
          console.error('No outro chanting available for', outroDuration)
          return null
        }
      }
    }

    return {
      mode: sessionMode,
      enableGong,
      introFile,
      outroFile,
      meditationMinutes: meditationDuration,
      instructionType
    }
  }, [metadata, sessionMode, enableGong, introDuration, outroDuration, meditationDuration, instructionType])

  // Start session
  const startSession = useCallback(() => {
    if (!metadata) return

    const config = prepareSessionConfig()
    if (!config) {
      // Could show user error here
      return
    }

    setSessionConfig(config)
    requestWakeLock()
    setPhase(getFirstPhase(config))
  }, [metadata, prepareSessionConfig, requestWakeLock])

  // Stop session
  const stopSession = useCallback(() => {
    audioControls.stop()
    timerControls.stop()
    setPhase('idle')
    setSessionConfig(null)
  }, [audioControls, timerControls])

  // Skip current phase
  const skipPhase = useCallback(() => {
    audioControls.stop()
    if (phase === 'meditation') {
      timerControls.stop()
    }
    setPhase(getNextPhase(phase, sessionConfig))
  }, [audioControls, timerControls, phase, sessionConfig])

  // Handle phase transitions
  useEffect(() => {
    if (phase === 'idle' || phase === 'complete') return
    if (!sessionConfig) return

    const devMode = import.meta.env.VITE_DEV_MODE === 'true'
    const devSeconds = parseInt(import.meta.env.VITE_DEV_MEDITATION_SECONDS || '30', 10)
    let devTimeout: number | null = null

    const runPhase = async () => {
      try {
        if (phase === 'meditation') {
          const minutes = devMode ? devSeconds / 60 : sessionConfig.meditationMinutes
          timerControls.start(minutes)
          return
        }

        const audioFile = getAudioForPhase(phase, sessionConfig)
        if (audioFile) {
          // In dev mode, set a timeout to skip after devSeconds
          if (devMode) {
            devTimeout = window.setTimeout(() => {
              audioControls.stop()
              if (phaseRef.current === phase) {
                setPhase(getNextPhase(phase, sessionConfig))
              }
            }, devSeconds * 1000)
          }

          await audioControls.play(audioFile)
        }

        // Check phase hasn't changed during playback
        if (phaseRef.current === phase) {
          setPhase(getNextPhase(phase, sessionConfig))
        }
      } catch (err) {
        console.error('Phase execution failed:', err)
        // Gracefully move to next phase on error
        if (phaseRef.current === phase) {
          setPhase(getNextPhase(phase, sessionConfig))
        }
      }
    }

    runPhase()

    return () => {
      if (devTimeout) {
        clearTimeout(devTimeout)
      }
    }
  }, [phase, sessionConfig, audioControls, timerControls])

  const isSessionActive = phase !== 'idle' && phase !== 'complete'

  return (
    <div className="app">
      <header>
        <h1>Daily Vipassana</h1>
        <p className="subtitle">
          Meditation with S.N. Goenka's chantings
          <span className="separator">·</span>
          <a
            className="source-link"
            href="https://github.com/shadowfax92/vipassana-daily-meditation-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
          </a>
        </p>
      </header>

      {phase === 'idle' && (
        <SessionSetup
          metadata={metadata}
          sessionMode={sessionMode}
          setSessionMode={setSessionMode}
          enableGong={enableGong}
          setEnableGong={setEnableGong}
          introDuration={introDuration}
          setIntroDuration={setIntroDuration}
          meditationDuration={meditationDuration}
          setMeditationDuration={setMeditationDuration}
          outroDuration={outroDuration}
          setOutroDuration={setOutroDuration}
          instructionType={instructionType}
          setInstructionType={setInstructionType}
          onStart={startSession}
        />
      )}

      {isSessionActive && (
        <SessionActive
          phase={phase}
          meditationTimeRemaining={meditationTimeRemaining}
          audioProgress={audioProgress}
          audioTimeRemaining={audioTimeRemaining}
          onSkip={skipPhase}
          onStop={stopSession}
        />
      )}

      {phase === 'complete' && (
        <SessionComplete onNewSession={() => setPhase('idle')} />
      )}

      <footer className="app-footer">
        <a href="https://daily-vipassana.app" target="_blank" rel="noopener noreferrer">
          daily-vipassana.app
        </a>
      </footer>
    </div>
  )
}

export default App
