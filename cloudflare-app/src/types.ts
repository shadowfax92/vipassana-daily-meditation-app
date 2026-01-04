export interface ChantingFile {
  file: string
  duration: number
}

export interface Metadata {
  chanting: {
    '2min': ChantingFile[]
    '5min': ChantingFile[]
    '10min': ChantingFile[]
  }
  guided?: {
    short: string
    long: string
  }
  outro: string
  gong: string
}

export type SessionMode = 'custom' | 'guided'
export type ChantingDuration = '2min' | '5min' | '10min' | 'none'
export type MeditationDuration = 20 | 30 | 60 | 90 | 120
export type InstructionType = 'short' | 'long'

export type SessionPhase =
  | 'idle'
  | 'gong'
  | 'intro'
  | 'meditation'
  | 'outro_chanting'
  | 'outro'
  | 'guided_session'
  | 'complete'

export interface SessionConfig {
  mode: SessionMode
  enableGong: boolean
  introFile: string | null
  outroFile: string | null
  meditationMinutes: number
  instructionType: InstructionType
}

export interface AudioProgress {
  current: number
  duration: number
}
