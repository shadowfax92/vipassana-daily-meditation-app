import { useRef, useCallback, useState, useMemo } from 'react'

export function useMeditationTimer(onComplete: () => void) {
  const [timeRemaining, setTimeRemaining] = useState(0)
  const timerRef = useRef<number | null>(null)
  const isRunningRef = useRef(false)

  const start = useCallback((minutes: number) => {
    const totalSeconds = minutes * 60
    setTimeRemaining(totalSeconds)
    isRunningRef.current = true

    timerRef.current = window.setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
          isRunningRef.current = false
          // Use setTimeout to avoid calling onComplete during render
          setTimeout(onComplete, 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [onComplete])

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    isRunningRef.current = false
    setTimeRemaining(0)
  }, [])

  const isRunning = isRunningRef.current

  // Memoize stable object for functions (used in effects)
  const controls = useMemo(() => ({ start, stop }), [start, stop])

  return { controls, timeRemaining, isRunning }
}
