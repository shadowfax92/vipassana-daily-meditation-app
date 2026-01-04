import type { SessionPhase, SessionConfig } from '../types'

export function getAudioForPhase(
  phase: SessionPhase,
  config: SessionConfig | null
): string | null {
  if (!config) return null

  switch (phase) {
    case 'gong':
      return '/audio/gong.mp3'
    case 'intro':
      return config.introFile ? `/audio/chanting/${config.introFile}` : null
    case 'outro_chanting':
      return config.outroFile ? `/audio/chanting/${config.outroFile}` : null
    case 'outro':
      return '/audio/outro.webm'
    case 'guided_session':
      return config.instructionType === 'short'
        ? '/audio/guided/short.mp3'
        : '/audio/guided/long.mp3'
    default:
      return null
  }
}

export function getNextPhase(
  currentPhase: SessionPhase,
  config: SessionConfig | null
): SessionPhase {
  if (!config) return 'idle'

  switch (currentPhase) {
    case 'gong':
      if (config.mode === 'guided') return 'guided_session'
      if (config.introFile) return 'intro'
      return 'meditation'

    case 'intro':
      return 'meditation'

    case 'meditation':
      if (config.outroFile) return 'outro_chanting'
      return 'outro'

    case 'outro_chanting':
      return 'outro'

    case 'outro':
      return 'complete'

    case 'guided_session':
      return 'complete'

    default:
      return 'idle'
  }
}

export function getFirstPhase(config: SessionConfig): SessionPhase {
  if (config.enableGong) return 'gong'
  if (config.mode === 'guided') return 'guided_session'
  if (config.introFile) return 'intro'
  return 'meditation'
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function getPhaseLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'gong': return '🔔 Starting Gong'
    case 'intro': return '🙏 Intro Chanting'
    case 'meditation': return '🧘 Meditation'
    case 'outro_chanting': return '🙏 Outro Chanting'
    case 'outro': return '🙏 Closing'
    case 'guided_session': return '🧘 Guided Session'
    default: return ''
  }
}

export function getTimeLabel(phase: SessionPhase): string {
  switch (phase) {
    case 'gong': return 'gong'
    case 'intro': return 'intro remaining'
    case 'meditation': return 'remaining'
    case 'outro_chanting': return 'outro remaining'
    case 'outro': return 'closing'
    case 'guided_session': return 'remaining'
    default: return ''
  }
}
