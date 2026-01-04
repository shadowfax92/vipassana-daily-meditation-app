import { useRef, useCallback, useState, useMemo } from 'react'
import type { AudioProgress } from '../types'

export interface PlayOptions {
  fadeInSeconds?: number
}

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeIntervalRef = useRef<number | null>(null)
  const [progress, setProgress] = useState<AudioProgress>({ current: 0, duration: 0 })

  const stop = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current)
      fadeIntervalRef.current = null
    }
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

  const play = useCallback((src: string, options?: PlayOptions): Promise<void> => {
    return new Promise((resolve, reject) => {
      stop()
      const audio = new Audio(src)
      audioRef.current = audio

      const fadeInSeconds = options?.fadeInSeconds || 0
      if (fadeInSeconds > 0) {
        audio.volume = 0
        const steps = fadeInSeconds * 10 // Update every 100ms
        const volumeStep = 1 / steps
        let currentStep = 0

        fadeIntervalRef.current = window.setInterval(() => {
          currentStep++
          const newVolume = Math.min(1, currentStep * volumeStep)
          if (audioRef.current) {
            audioRef.current.volume = newVolume
          }
          if (currentStep >= steps && fadeIntervalRef.current) {
            clearInterval(fadeIntervalRef.current)
            fadeIntervalRef.current = null
          }
        }, 100)
      }

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
