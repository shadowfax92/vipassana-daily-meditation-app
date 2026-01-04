import type {
  SessionMode,
  ChantingDuration,
  MeditationDuration,
  InstructionType,
  Metadata
} from '../types'
import { hasChantingsAvailable } from '../utils/chanting'

interface SessionSetupProps {
  metadata: Metadata | null
  sessionMode: SessionMode
  setSessionMode: (mode: SessionMode) => void
  enableGong: boolean
  setEnableGong: (enable: boolean) => void
  introDuration: ChantingDuration
  setIntroDuration: (duration: ChantingDuration) => void
  meditationDuration: MeditationDuration
  setMeditationDuration: (duration: MeditationDuration) => void
  outroDuration: ChantingDuration
  setOutroDuration: (duration: ChantingDuration) => void
  instructionType: InstructionType
  setInstructionType: (type: InstructionType) => void
  onStart: () => void
}

const CHANTING_DURATIONS: ChantingDuration[] = ['2min', '5min', '10min']
const MEDITATION_DURATIONS: MeditationDuration[] = [20, 30, 60, 90, 120]

export function SessionSetup({
  metadata,
  sessionMode,
  setSessionMode,
  enableGong,
  setEnableGong,
  introDuration,
  setIntroDuration,
  meditationDuration,
  setMeditationDuration,
  outroDuration,
  setOutroDuration,
  instructionType,
  setInstructionType,
  onStart
}: SessionSetupProps) {
  return (
    <div className="setup">
      <div className="mode-selector">
        <button
          className={sessionMode === 'custom' ? 'selected' : ''}
          onClick={() => setSessionMode('custom')}
        >
          Custom
        </button>
        <button
          className={sessionMode === 'guided' ? 'selected' : ''}
          onClick={() => setSessionMode('guided')}
        >
          Guided
        </button>
      </div>

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

      {sessionMode === 'custom' && (
        <>
          <section className="option-group">
            <h2>Intro Chanting</h2>
            <div className="button-group">
              <button
                className={introDuration === 'none' ? 'selected' : ''}
                onClick={() => setIntroDuration('none')}
              >
                None
              </button>
              {CHANTING_DURATIONS.map(dur => (
                <button
                  key={dur}
                  className={introDuration === dur ? 'selected' : ''}
                  onClick={() => setIntroDuration(dur)}
                  disabled={!hasChantingsAvailable(metadata, dur)}
                >
                  {dur.replace('min', ' min')}
                </button>
              ))}
            </div>
          </section>

          <section className="option-group">
            <h2>Meditation Duration</h2>
            <div className="button-group">
              {MEDITATION_DURATIONS.map(dur => (
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
              {CHANTING_DURATIONS.map(dur => (
                <button
                  key={dur}
                  className={outroDuration === dur ? 'selected' : ''}
                  onClick={() => setOutroDuration(dur)}
                  disabled={!hasChantingsAvailable(metadata, dur)}
                >
                  {dur.replace('min', ' min')}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {sessionMode === 'guided' && (
        <section className="option-group">
          <h2>Instruction Type</h2>
          <div className="instruction-cards">
            <button
              className={`instruction-card ${instructionType === 'short' ? 'selected' : ''}`}
              onClick={() => setInstructionType('short')}
            >
              <span className="card-title">Short Instructions</span>
              <span className="card-duration">~1hr 6min</span>
            </button>
            <button
              className={`instruction-card ${instructionType === 'long' ? 'selected' : ''}`}
              onClick={() => setInstructionType('long')}
            >
              <span className="card-title">Long Instructions</span>
              <span className="card-duration">~1hr 5min</span>
            </button>
          </div>
        </section>
      )}

      <button
        className="start-button"
        onClick={onStart}
        disabled={!metadata}
      >
        {metadata ? 'Start Session' : 'Loading...'}
      </button>
    </div>
  )
}
