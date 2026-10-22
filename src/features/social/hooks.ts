import { useCallback, useEffect, useRef, useState } from 'react'
import { errorText } from './api'

/** Memory only, scoped to this screen. Background polls update atomically so
 * native <details> stay mounted; denied/offline/error reads discard prior data. */
export function useRemote<T>(
  read: () => Promise<T>,
  dependencies: unknown[],
  clearOnRefresh = false,
) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const refresh = useCallback(async (background = false) => {
    const id = ++generation.current
    // Explicit/initial loads may clear sensitive projections immediately.
    // Background checks keep the existing DOM until the permission-checked
    // response arrives; unmounting cards every 15s collapses expanded details.
    if (clearOnRefresh && !background) setData(null)
    if (!background) setLoading(true)
    setError('')
    try {
      if (!navigator.onLine) throw new Error('Go online to load this page.')
      const value = await read()
      if (id === generation.current) setData(value)
    } catch (e) {
      if (id === generation.current) {
        setData(null)
        setError(errorText(e))
      }
    } finally {
      if (id === generation.current && !background) setLoading(false)
    }
  }, dependencies)
  useEffect(() => {
    setData(null)
    void refresh()
    const timer = window.setInterval(() => void refresh(true), 15_000)
    const focus = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    const onOnline = () => void refresh()
    const offline = () => {
      generation.current++
      setData(null)
      setLoading(false)
      setError('Go online to load this page.')
    }
    document.addEventListener('visibilitychange', focus)
    window.addEventListener('offline', offline)
    window.addEventListener('online', onOnline)
    return () => {
      generation.current++
      clearInterval(timer)
      document.removeEventListener('visibilitychange', focus)
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])
  return { data, error, loading, refresh }
}
