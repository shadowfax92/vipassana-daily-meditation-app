import type { Metadata, ChantingDuration } from '../types'

export function getRandomChanting(
  metadata: Metadata | null,
  duration: ChantingDuration
): string | null {
  if (!metadata || duration === 'none') return null
  const chantings = metadata.chanting[duration]
  if (!chantings.length) return null
  return chantings[Math.floor(Math.random() * chantings.length)].file
}

export function selectChantingWithRetry(
  metadata: Metadata | null,
  duration: ChantingDuration,
  maxRetries = 3
): string | null {
  for (let i = 0; i < maxRetries; i++) {
    const file = getRandomChanting(metadata, duration)
    if (file) return file
  }
  return null
}

export function hasChantingsAvailable(
  metadata: Metadata | null,
  duration: ChantingDuration
): boolean {
  if (duration === 'none') return true
  if (!metadata) return false
  return metadata.chanting[duration]?.length > 0
}
