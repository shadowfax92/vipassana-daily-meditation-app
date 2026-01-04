import type { SessionPhase, AudioProgress } from '../types'
import { formatTime, getPhaseLabel, getTimeLabel } from '../utils/phase'

interface SessionActiveProps {
  phase: SessionPhase
  meditationTimeRemaining: number
  audioProgress: AudioProgress
  audioTimeRemaining: number
  onSkip: () => void
  onStop: () => void
}

function getSkipButtonLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'gong': return 'Skip Gong →'
    case 'intro': return 'Skip to Meditation →'
    case 'meditation': return 'End Meditation →'
    case 'outro_chanting': return 'Skip to Closing →'
    case 'outro': return 'Skip Closing →'
    case 'guided_session': return 'End Session →'
    default: return 'Skip →'
  }
}

export function SessionActive({
  phase,
  meditationTimeRemaining,
  audioProgress,
  audioTimeRemaining,
  onSkip,
  onStop
}: SessionActiveProps) {
  const showProgressBar = phase !== 'meditation' && audioProgress.duration > 0

  return (
    <div className="session">
      <div className="phase-indicator">
        {getPhaseLabel(phase)}
      </div>

      <div className="timer">
        {phase === 'meditation' ? (
          <>
            <div className="time-display">{formatTime(meditationTimeRemaining)}</div>
            <div className="time-label">remaining</div>
          </>
        ) : (
          <>
            <div className="time-display">
              {audioProgress.duration > 0 ? formatTime(audioTimeRemaining) : '--:--'}
            </div>
            <div className="time-label">{getTimeLabel(phase)}</div>
          </>
        )}
      </div>

      {showProgressBar && (
        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{ width: `${(audioProgress.current / audioProgress.duration) * 100}%` }}
          />
        </div>
      )}

      <div className="session-actions">
        <button className="skip-button" onClick={onSkip}>
          {getSkipButtonLabel(phase)}
        </button>
        <button className="stop-button" onClick={onStop}>
          Stop Session
        </button>
      </div>
    </div>
  )
}
