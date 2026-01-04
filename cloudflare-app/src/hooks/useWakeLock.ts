import { useRef, useCallback, useEffect } from 'react'
import type { SessionPhase } from '../types'

export function useWakeLock(phase: SessionPhase) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const phaseRef = useRef<SessionPhase>(phase)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const request = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      console.log('Wake Lock API not supported')
      return
    }
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
      console.log('Wake Lock acquired')
      wakeLockRef.current.addEventListener('release', () => {
        console.log('Wake Lock released')
      })
    } catch (err) {
      console.log('Wake Lock request failed:', err)
    }
  }, [])

  const release = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release()
      wakeLockRef.current = null
    }
  }, [])

  // Re-acquire when page becomes visible (iOS releases on hide)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' &&
          phaseRef.current !== 'idle' &&
          phaseRef.current !== 'complete') {
        request()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [request])

  // Release on complete
  useEffect(() => {
    if (phase === 'complete') {
      release()
    }
  }, [phase, release])

  return { request, release }
}
