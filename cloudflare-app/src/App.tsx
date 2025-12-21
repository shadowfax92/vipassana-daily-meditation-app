import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

interface Metadata {
  intros: {
    '2min': { file: string; duration: number }[]
    '5min': { file: string; duration: number }[]
    '10min': { file: string; duration: number }[]
  }
  outro: string
  gong: string
}

type IntroDuration = '2min' | '5min' | '10min'
type MeditationDuration = 30 | 60 | 90 | 120

type SessionPhase = 'idle' | 'intro' | 'meditation' | 'outro' | 'gong' | 'complete'

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function App() {
  const [metadata, setMetadata] = useState<Metadata | null>(null)
  const [introDuration, setIntroDuration] = useState<IntroDuration>('5min')
  const [meditationDuration, setMeditationDuration] = useState<MeditationDuration>(30)
  const [enableGong, setEnableGong] = useState(true)

  const [phase, setPhase] = useState<SessionPhase>('idle')
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [currentIntro, setCurrentIntro] = useState<string | null>(null)

  // Audio progress tracking
  const [audioProgress, setAudioProgress] = useState({ current: 0, duration: 0 })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const phaseRef = useRef<SessionPhase>('idle')

  // Keep phaseRef in sync with phase state (for use in async callbacks)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // Load metadata on mount
  useEffect(() => {
    fetch('/audio/metadata.json')
      .then(res => res.json())
      .then(data => setMetadata(data))
      .catch(err => console.error('Failed to load metadata:', err))
  }, [])

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onloadedmetadata = null
      audioRef.current.ontimeupdate = null
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    setAudioProgress({ current: 0, duration: 0 })
  }, [])

  const playAudio = useCallback((src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      cleanup()
      const audio = new Audio(src)
      audioRef.current = audio

      audio.onloadedmetadata = () => {
        setAudioProgress(prev => ({ ...prev, duration: audio.duration }))
      }

      audio.ontimeupdate = () => {
        setAudioProgress({
          current: audio.currentTime,
          duration: audio.duration || 0
        })
      }

      audio.onended = () => {
        setAudioProgress({ current: 0, duration: 0 })
        resolve()
      }

      audio.onerror = () => reject(new Error(`Failed to play ${src}`))
      audio.play().catch(reject)
    })
  }, [cleanup])

  const startMeditationTimer = useCallback(() => {
    const totalSeconds = meditationDuration * 60
    setTimeRemaining(totalSeconds)

    timerRef.current = window.setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [meditationDuration])

  // Watch for timer completion
  useEffect(() => {
    if (phase === 'meditation' && timeRemaining === 0) {
      setPhase('outro')
    }
  }, [phase, timeRemaining])

  // Handle phase transitions
  useEffect(() => {
    if (phase === 'intro' && currentIntro) {
      playAudio(`/audio/intro/${currentIntro}`)
        .then(() => {
          // Only transition if still in intro phase (handles skip race condition)
          if (phaseRef.current === 'intro') {
            setPhase('meditation')
            startMeditationTimer()
          }
        })
        .catch(err => {
          console.error('Intro playback failed:', err)
          // Only reset if still in intro phase
          if (phaseRef.current === 'intro') {
            setPhase('idle')
          }
        })
    } else if (phase === 'outro') {
      playAudio('/audio/outro.webm')
        .then(() => {
          if (phaseRef.current === 'outro') {
            if (enableGong) {
              setPhase('gong')
            } else {
              setPhase('complete')
            }
          }
        })
        .catch(err => {
          console.error('Outro playback failed:', err)
          if (phaseRef.current === 'outro') {
            setPhase('complete')
          }
        })
    } else if (phase === 'gong') {
      playAudio('/audio/gong.mp3')
        .then(() => {
          if (phaseRef.current === 'gong') {
            setPhase('complete')
          }
        })
        .catch(err => {
          console.error('Gong playback failed:', err)
          if (phaseRef.current === 'gong') {
            setPhase('complete')
          }
        })
    }
  }, [phase, currentIntro, enableGong, playAudio, startMeditationTimer])

  const startSession = () => {
    if (!metadata) return

    const intros = metadata.intros[introDuration]
    if (!intros.length) {
      console.error('No intros available for selected duration')
      return
    }

    const randomIntro = intros[Math.floor(Math.random() * intros.length)]
    setCurrentIntro(randomIntro.file)
    setPhase('intro')
  }

  const stopSession = () => {
    cleanup()
    setPhase('idle')
    setTimeRemaining(0)
    setCurrentIntro(null)
  }

  const skipIntro = useCallback(() => {
    if (phase !== 'intro') return
    cleanup()
    setPhase('meditation')
    startMeditationTimer()
  }, [phase, cleanup, startMeditationTimer])

  const isSessionActive = phase !== 'idle' && phase !== 'complete'

  // Calculate audio time remaining (for intro, outro, gong phases)
  const audioTimeRemaining = Math.max(0, Math.ceil(audioProgress.duration - audioProgress.current))

  return (
    <div className="app">
      <header>
        <h1>Vipassana Timer</h1>
        <p className="subtitle">Meditation with S.N. Goenka's chantings</p>
      </header>

      {phase === 'idle' && (
        <div className="setup">
          <section className="option-group">
            <h2>Intro Chanting</h2>
            <div className="button-group">
              {(['2min', '5min', '10min'] as IntroDuration[]).map(dur => (
                <button
                  key={dur}
                  className={introDuration === dur ? 'selected' : ''}
                  onClick={() => setIntroDuration(dur)}
                >
                  {dur.replace('min', ' min')}
                </button>
              ))}
            </div>
          </section>

          <section className="option-group">
            <h2>Meditation Duration</h2>
            <div className="button-group">
              {([30, 60, 90, 120] as MeditationDuration[]).map(dur => (
                <button
                  key={dur}
                  className={meditationDuration === dur ? 'selected' : ''}
                  onClick={() => setMeditationDuration(dur)}
                >
                  {dur} min
                </button>
              ))}
            </div>
          </section>

          <section className="option-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={enableGong}
                onChange={e => setEnableGong(e.target.checked)}
              />
              Play gong at the end
            </label>
          </section>

          <button
            className="start-button"
            onClick={startSession}
            disabled={!metadata}
          >
            {metadata ? 'Start Session' : 'Loading...'}
          </button>
        </div>
      )}

      {isSessionActive && (
        <div className="session">
          <div className="phase-indicator">
            {phase === 'intro' && '🙏 Intro Chanting'}
            {phase === 'meditation' && '🧘 Meditation'}
            {phase === 'outro' && '🙏 Closing Chanting'}
            {phase === 'gong' && '🔔 Gong'}
          </div>

          <div className="timer">
            {phase === 'meditation' ? (
              <>
                <div className="time-display">{formatTime(timeRemaining)}</div>
                <div className="time-label">remaining</div>
              </>
            ) : (
              <>
                <div className="time-display">
                  {audioProgress.duration > 0 ? formatTime(audioTimeRemaining) : '--:--'}
                </div>
                <div className="time-label">
                  {phase === 'intro' && 'intro remaining'}
                  {phase === 'outro' && 'closing remaining'}
                  {phase === 'gong' && 'gong remaining'}
                </div>
              </>
            )}
          </div>

          {/* Progress bar for audio phases */}
          {(phase === 'intro' || phase === 'outro' || phase === 'gong') && audioProgress.duration > 0 && (
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${(audioProgress.current / audioProgress.duration) * 100}%` }}
              />
            </div>
          )}

          <div className="session-actions">
            {phase === 'intro' && (
              <button className="skip-button" onClick={skipIntro}>
                Skip Intro →
              </button>
            )}
            <button className="stop-button" onClick={stopSession}>
              Stop Session
            </button>
          </div>
        </div>
      )}

      {phase === 'complete' && (
        <div className="complete">
          <div className="complete-message">
            <span className="complete-icon">✨</span>
            <h2>Session Complete</h2>
            <p>May all beings be happy.</p>
          </div>
          <button className="start-button" onClick={() => setPhase('idle')}>
            New Session
          </button>
        </div>
      )}
    </div>
  )
}

export default App
