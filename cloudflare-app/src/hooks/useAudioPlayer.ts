import { useRef, useCallback, useState, useMemo } from 'react'
import type { AudioProgress } from '../types'

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [progress, setProgress] = useState<AudioProgress>({ current: 0, duration: 0 })

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onloadedmetadata = null
      audioRef.current.ontimeupdate = null
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current = null
    }
    setProgress({ current: 0, duration: 0 })
  }, [])

  const play = useCallback((src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      stop()
      const audio = new Audio(src)
      audioRef.current = audio

      audio.onloadedmetadata = () => {
        setProgress(prev => ({ ...prev, duration: audio.duration }))
      }

      audio.ontimeupdate = () => {
        setProgress({
          current: audio.currentTime,
          duration: audio.duration || 0
        })
      }

      audio.onended = () => {
        setProgress({ current: 0, duration: 0 })
        resolve()
      }

      audio.onerror = () => reject(new Error(`Failed to play ${src}`))
      audio.play().catch(reject)
    })
  }, [stop])

  const timeRemaining = Math.max(0, Math.ceil(progress.duration - progress.current))

  // Memoize stable object for functions (used in effects)
  const controls = useMemo(() => ({ play, stop }), [play, stop])

  return { controls, progress, timeRemaining }
}
