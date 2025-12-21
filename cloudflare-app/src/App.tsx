import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

interface Metadata {
  chanting: {
    '2min': { file: string; duration: number }[]
    '5min': { file: string; duration: number }[]
    '10min': { file: string; duration: number }[]
  }
  outro: string
  gong: string
}

type ChantingDuration = '2min' | '5min' | '10min' | 'none'
type MeditationDuration = 30 | 60 | 90 | 120

type SessionPhase =
  | 'idle'
  | 'gong'
  | 'intro'
  | 'meditation'
  | 'outro_chanting'
  | 'outro'
  | 'complete'

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function App() {
  const [metadata, setMetadata] = useState<Metadata | null>(null)

  // Settings
  const [enableGong, setEnableGong] = useState(false)
  const [introDuration, setIntroDuration] = useState<ChantingDuration>('5min')
  const [meditationDuration, setMeditationDuration] = useState<MeditationDuration>(30)
  const [outroDuration, setOutroDuration] = useState<ChantingDuration>('5min')

  // Session state
  const [phase, setPhase] = useState<SessionPhase>('idle')
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [currentChanting, setCurrentChanting] = useState<string | null>(null)
  const [audioProgress, setAudioProgress] = useState({ current: 0, duration: 0 })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const phaseRef = useRef<SessionPhase>('idle')

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

  const getRandomChanting = useCallback((duration: ChantingDuration): string | null => {
    if (!metadata || duration === 'none') return null
    const chantings = metadata.chanting[duration]
    if (!chantings.length) return null
    return chantings[Math.floor(Math.random() * chantings.length)].file
  }, [metadata])

  // Watch for timer completion
  useEffect(() => {
    if (phase === 'meditation' && timeRemaining === 0) {
      if (outroDuration !== 'none') {
        const outroChant = getRandomChanting(outroDuration)
        setCurrentChanting(outroChant)
        setPhase('outro_chanting')
      } else {
        setPhase('outro')
      }
    }
  }, [phase, timeRemaining, outroDuration, getRandomChanting])

  // Handle phase transitions
  useEffect(() => {
    const handlePhaseTransition = async () => {
      try {
        if (phase === 'gong') {
          await playAudio('/audio/gong.mp3')
          if (phaseRef.current === 'gong') {
            if (introDuration !== 'none') {
              const introChant = getRandomChanting(introDuration)
              setCurrentChanting(introChant)
              setPhase('intro')
            } else {
              setPhase('meditation')
              startMeditationTimer()
            }
          }
        } else if (phase === 'intro' && currentChanting) {
          await playAudio(`/audio/chanting/${currentChanting}`)
          if (phaseRef.current === 'intro') {
            setPhase('meditation')
            startMeditationTimer()
          }
        } else if (phase === 'outro_chanting' && currentChanting) {
          await playAudio(`/audio/chanting/${currentChanting}`)
          if (phaseRef.current === 'outro_chanting') {
            setPhase('outro')
          }
        } else if (phase === 'outro') {
          await playAudio('/audio/outro.webm')
          if (phaseRef.current === 'outro') {
            setPhase('complete')
          }
        }
      } catch (err) {
        console.error('Playback failed:', err)
        // Gracefully move to next phase on error
        if (phaseRef.current === 'gong') {
          if (introDuration !== 'none') {
            const introChant = getRandomChanting(introDuration)
            setCurrentChanting(introChant)
            setPhase('intro')
          } else {
            setPhase('meditation')
            startMeditationTimer()
          }
        } else if (phaseRef.current === 'intro') {
          setPhase('meditation')
          startMeditationTimer()
        } else if (phaseRef.current === 'outro_chanting') {
          setPhase('outro')
        } else if (phaseRef.current === 'outro') {
          setPhase('complete')
        }
      }
    }

    if (phase !== 'idle' && phase !== 'meditation' && phase !== 'complete') {
      handlePhaseTransition()
    }
  }, [phase, currentChanting, introDuration, outroDuration, playAudio, startMeditationTimer, getRandomChanting])

  const startSession = () => {
    if (!metadata) return

    if (enableGong) {
      setPhase('gong')
    } else if (introDuration !== 'none') {
      const introChant = getRandomChanting(introDuration)
      setCurrentChanting(introChant)
      setPhase('intro')
    } else {
      setPhase('meditation')
      startMeditationTimer()
    }
  }

  const stopSession = () => {
    cleanup()
    setPhase('idle')
    setTimeRemaining(0)
    setCurrentChanting(null)
  }

  // Skip functions for each phase
  const skipGong = useCallback(() => {
    if (phase !== 'gong') return
    cleanup()
    if (introDuration !== 'none') {
      const introChant = getRandomChanting(introDuration)
      setCurrentChanting(introChant)
      setPhase('intro')
    } else {
      setPhase('meditation')
      startMeditationTimer()
    }
  }, [phase, cleanup, introDuration, getRandomChanting, startMeditationTimer])

  const skipIntro = useCallback(() => {
    if (phase !== 'intro') return
    cleanup()
    setPhase('meditation')
    startMeditationTimer()
  }, [phase, cleanup, startMeditationTimer])

  const skipMeditation = useCallback(() => {
    if (phase !== 'meditation') return
    cleanup()
    if (outroDuration !== 'none') {
      const outroChant = getRandomChanting(outroDuration)
      setCurrentChanting(outroChant)
      setPhase('outro_chanting')
    } else {
      setPhase('outro')
    }
  }, [phase, cleanup, outroDuration, getRandomChanting])

  const skipOutroChanting = useCallback(() => {
    if (phase !== 'outro_chanting') return
    cleanup()
    setPhase('outro')
  }, [phase, cleanup])

  const skipOutro = useCallback(() => {
    if (phase !== 'outro') return
    cleanup()
    setPhase('complete')
  }, [phase, cleanup])

  const isSessionActive = phase !== 'idle' && phase !== 'complete'
  const audioTimeRemaining = Math.max(0, Math.ceil(audioProgress.duration - audioProgress.current))

  // Check available chanting options
  const hasChanting = (dur: ChantingDuration) => {
    if (dur === 'none') return true
    if (!metadata) return false
    return metadata.chanting[dur]?.length > 0
  }

  return (
    <div className="app">
      <header>
        <h1>Vipassana Timer</h1>
        <p className="subtitle">Meditation with S.N. Goenka's chantings</p>
      </header>

      {phase === 'idle' && (
        <div className="setup">
          <section className="option-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={enableGong}
                onChange={e => setEnableGong(e.target.checked)}
              />
              Play gong at start
            </label>
          </section>

          <section className="option-group">
            <h2>Intro Chanting</h2>
            <div className="button-group">
              <button
                className={introDuration === 'none' ? 'selected' : ''}
                onClick={() => setIntroDuration('none')}
              >
                None
              </button>
              {(['2min', '5min', '10min'] as const).map(dur => (
                <button
                  key={dur}
                  className={introDuration === dur ? 'selected' : ''}
                  onClick={() => setIntroDuration(dur)}
                  disabled={!hasChanting(dur)}
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
            <h2>Outro Chanting</h2>
            <div className="button-group">
              <button
                className={outroDuration === 'none' ? 'selected' : ''}
                onClick={() => setOutroDuration('none')}
              >
                None
              </button>
              {(['2min', '5min', '10min'] as const).map(dur => (
                <button
                  key={dur}
                  className={outroDuration === dur ? 'selected' : ''}
                  onClick={() => setOutroDuration(dur)}
                  disabled={!hasChanting(dur)}
                >
                  {dur.replace('min', ' min')}
                </button>
              ))}
            </div>
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
            {phase === 'gong' && '🔔 Starting Gong'}
            {phase === 'intro' && '🙏 Intro Chanting'}
            {phase === 'meditation' && '🧘 Meditation'}
            {phase === 'outro_chanting' && '🙏 Outro Chanting'}
            {phase === 'outro' && '🙏 Closing'}
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
                  {phase === 'gong' && 'gong'}
                  {phase === 'intro' && 'intro remaining'}
                  {phase === 'outro_chanting' && 'outro remaining'}
                  {phase === 'outro' && 'closing'}
                </div>
              </>
            )}
          </div>

          {(phase === 'gong' || phase === 'intro' || phase === 'outro_chanting' || phase === 'outro') &&
           audioProgress.duration > 0 && (
            <div className="progress-bar-container">
              <div
                className="progress-bar"
                style={{ width: `${(audioProgress.current / audioProgress.duration) * 100}%` }}
              />
            </div>
          )}

          <div className="session-actions">
            {phase === 'gong' && (
              <button className="skip-button" onClick={skipGong}>
                Skip Gong →
              </button>
            )}
            {phase === 'intro' && (
              <button className="skip-button" onClick={skipIntro}>
                Skip to Meditation →
              </button>
            )}
            {phase === 'meditation' && (
              <button className="skip-button" onClick={skipMeditation}>
                End Meditation →
              </button>
            )}
            {phase === 'outro_chanting' && (
              <button className="skip-button" onClick={skipOutroChanting}>
                Skip to Closing →
              </button>
            )}
            {phase === 'outro' && (
              <button className="skip-button" onClick={skipOutro}>
                Skip Closing →
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
            <p>Bhavatu Sabba Mangalam</p>
            <p className="translation">May all beings be happy</p>
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
