import { useEffect, useRef, useState } from 'react'
import { analysisApi, getApiErrorMessage } from '../services/api'
import type { AnalysisResult, TaskStepDetails } from '../types/api'

// Guards against server regressions where a "done" step briefly reports back
// as "waiting"/"running" during the next poll tick (DB replication lag, etc.)
const ORDERED_STEPS: (keyof TaskStepDetails)[] = [
  'detection', 'emotion', 'ocr', 'scene', 'story', 'tts', 'quiz',
]

function mergeStepDetails(
  prev: TaskStepDetails | null,
  next: TaskStepDetails | null | undefined,
): TaskStepDetails | null {
  if (!next) return prev
  if (!prev) return next

  const merged = { ...prev }

  for (const key of ORDERED_STEPS) {
    const prevStep = prev[key]
    const nextStep = next[key]

    const prevStatus = prevStep.status
    const nextStatus = nextStep.status

    // Never regress a completed step to waiting/running
    if (prevStatus === 'done' && (nextStatus === 'waiting' || nextStatus === 'running')) {
      merged[key] = prevStep
      continue
    }
    if (prevStatus === 'failed' && nextStatus !== 'done') {
      merged[key] = prevStep
      continue
    }

    merged[key] = {
      status: nextStatus,
      seconds:
        typeof nextStep.seconds === 'number' ? nextStep.seconds
        : typeof prevStep.seconds === 'number' ? prevStep.seconds
        : null,
    }
  }

  return merged
}

export interface UseTaskPollingResult {
  result: AnalysisResult | null
  status: string
  currentStep: string | null
  progressMessage: string | null
  stepDetails: TaskStepDetails | null
  displayPercent: number
  error: string | null
}

export function useTaskPolling(taskId: string | undefined): UseTaskPollingResult {
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [status, setStatus] = useState('pending')
  const [currentStep, setCurrentStep] = useState<string | null>('queued')
  const [progressMessage, setProgressMessage] = useState<string | null>('Waiting in queue...')
  const [stepDetails, setStepDetails] = useState<TaskStepDetails | null>(null)
  const [displayPercent, setDisplayPercent] = useState(0)
  const [serverPercent, setServerPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  // Audio narration finishes as a background task after the rest of the
  // pipeline reports "completed" (see backend: synthesise_audio_task). This
  // tracks whether we've already fetched the full result at least once, so
  // we don't re-fetch on every poll while only waiting on audio_url.
  const hasFetchedResultRef = useRef(false)

  useEffect(() => {
    if (!taskId) return

    isMountedRef.current = true
    hasFetchedResultRef.current = false
    setResult(null)
    setStatus('pending')
    setCurrentStep('queued')
    setProgressMessage('Waiting in queue...')
    setStepDetails(null)
    setDisplayPercent(0)
    setServerPercent(0)
    setError(null)

    let stopped = false

    const schedulePoll = (delayMs: number) => {
      if (stopped) return
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      pollTimerRef.current = setTimeout(() => { void poll() }, delayMs)
    }

    const fetchResult = async () => {
      const res = await analysisApi.getResult(taskId)
      if (!isMountedRef.current || stopped) return
      setResult(res.data)
      setStatus('completed')
      setCurrentStep(null)
      setProgressMessage(null)
      setDisplayPercent(100)
      setServerPercent(100)
    }

    const poll = async () => {
      try {
        const res = await analysisApi.getStatus(taskId)
        const task = res.data
        if (!isMountedRef.current || stopped) return

        setStatus(task.status)
        setCurrentStep(task.current_step ?? null)
        setStepDetails((prev) => mergeStepDetails(prev, task.step_details ?? null))
        setServerPercent((prev) => {
          const incoming = typeof task.progress_percent === 'number' ? task.progress_percent : 0
          if (task.status === 'completed') return 100
          if (task.status === 'failed') return prev
          return Math.max(prev, incoming)
        })

        if (task.status === 'processing' || task.status === 'pending') {
          setProgressMessage(task.progress_message ?? null)
        }

        if (task.status === 'failed') { setError(task.error_message ?? 'Analysis failed.'); return }

        if (task.status === 'completed') {
          const ttsStatus = task.step_details?.tts?.status
          const ttsStillPending = ttsStatus === 'running' || ttsStatus === 'waiting'

          // Fetch once immediately on first completion (shows detections/story/
          // quiz/etc. right away), and once more when audio finishes resolving
          // (done or failed) to pick up the final audio_url. Skip re-fetching on
          // every poll in between while only audio is still pending.
          if (!hasFetchedResultRef.current || !ttsStillPending) {
            await fetchResult()
            hasFetchedResultRef.current = true
          }

          if (ttsStillPending) {
            schedulePoll(1500)
          }
          return
        }

        schedulePoll(task.status === 'pending' ? 1200 : 700)
      } catch (err: unknown) {
        if (!isMountedRef.current || stopped) return
        setError(getApiErrorMessage(err, 'Failed to fetch results.'))
      }
    }

    void poll()

    return () => {
      stopped = true
      isMountedRef.current = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [taskId])

  useEffect(() => {
    if (result) return

    const tick = setInterval(() => {
      setDisplayPercent((prev) => {
        if (status === 'completed') return 100
        if (status === 'failed') return prev
        if (prev < serverPercent) return Math.min(serverPercent, prev + 2)
        if (status === 'processing') {
          const softCap = Math.min(serverPercent + 3, 97)
          if (prev < softCap) return prev + 1
        }
        return prev
      })
    }, 180)

    return () => clearInterval(tick)
  }, [serverPercent, status, result])

  return { result, status, currentStep, progressMessage, stepDetails, displayPercent, error }
}
