import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  CheckCircle,
  XCircle,
  Loader2,
  Volume2,
  BookOpen,
  Eye,
  Smile,
  Sparkles,
  AlertTriangle,
  Clock3,
  ScanText,
  GraduationCap,
  ArrowRight,
  Layers,
  Zap,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getApiErrorMessage, vocabularyApi } from '../services/api'
import type {
  AnalysisResult,
  DetectionObject,
  QuizQuestion,
  StoryResult,
  TaskStepDetails,
} from '../types/api'
import { SurfaceCard, StatusBadge, StepStatusBadge } from '../components/ui'
import { useTaskPolling } from '../hooks/useTaskPolling'
import { STORY_TYPE_LABELS } from '../constants/analysis'
import clsx from 'clsx'

// ── Constants ─────────────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  detection: 'Object Detection',
  emotion: 'Emotion Analysis',
  ocr: 'Text Extraction',
  scene: 'Scene Description',
  story: 'Story Generation',
  tts: 'Audio Narration',
  quiz: 'Quiz Generation',
}

const STEP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  detection: Eye,
  emotion: Smile,
  ocr: ScanText,
  scene: Sparkles,
  story: BookOpen,
  tts: Volume2,
  quiz: GraduationCap,
}

const ORDERED_STEPS: (keyof TaskStepDetails)[] = [
  'detection', 'emotion', 'ocr', 'scene', 'story', 'tts', 'quiz',
]

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8001'

// ── Utility functions ─────────────────────────────────────────────────────

function confidenceBadgeColor(conf: number) {
  if (conf >= 0.8) return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20'
  if (conf >= 0.6) return 'bg-amber-500/15 text-amber-300 border-amber-400/20'
  return 'bg-rose-500/15 text-rose-300 border-rose-400/20'
}

function isStoryFailure(content: string) {
  return (
    content.startsWith('[Story generation failed') ||
    content.startsWith('[Story generation unavailable')
  )
}

// ── Karaoke story renderer ────────────────────────────────────────────────

/**
 * Assigns each word a time window based on character length + punctuation pauses.
 * Short words (a, the) get less time; long words (magnificent) get more.
 * Sentence-end pauses (.!?) and clause pauses (,;:) are added so the cursor
 * stays on the last word of a phrase while the speaker pauses.
 */
function buildWordTimings(words: string[], duration: number, leadInSec = 0.25) {
  const weights = words.map((word) => {
    const letters = word.replace(/\W/g, '').length
    let w = 0.35 + letters * 0.55           // base + proportional to syllable count
    if (/[.!?]$/.test(word))  w += 2.2      // full stop — speaker pauses
    else if (/[,;:]$/.test(word)) w += 0.9  // clause pause
    else if (/[-—]$/.test(word)) w += 0.4   // dash pause
    return Math.max(0.25, w)
  })

  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const available   = Math.max(0, duration - leadInSec)
  const scale       = available / totalWeight

  const timings: number[] = []  // start time of each word (seconds)
  let elapsed = leadInSec
  for (const w of weights) {
    timings.push(elapsed)
    elapsed += w * scale
  }
  return timings
}

function KaraokeStory({
  content,
  currentTime,
  duration,
}: {
  content: string
  currentTime: number
  duration: number
}) {
  const activeWordRef = useRef<HTMLSpanElement>(null)

  const paragraphs = content.split('\n').filter(Boolean)
  let counter = 0
  const paras = paragraphs.map((para) => {
    const words = para.trim().split(/\s+/)
    const start = counter
    counter += words.length
    return { words, start }
  })

  // Flatten all words once for timing
  const allWords = paras.flatMap((p) => p.words)
  const timings  = useMemo(
    () => (duration > 0 ? buildWordTimings(allWords, duration) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allWords.join(' '), duration],
  )

  const activeIdx =
    currentTime > 0 && duration > 0
      ? (() => {
          let last = -1
          for (let i = 0; i < timings.length; i++) {
            if (timings[i] <= currentTime) last = i
            else break
          }
          return last
        })()
      : -1

  useEffect(() => {
    activeWordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeIdx])

  return (
    <div className="text-sm leading-7 font-light select-text">
      {paras.map(({ words, start }, pi) => (
        <p key={pi} className={pi > 0 ? 'mt-3' : ''}>
          {words.map((word, wi) => {
            const idx     = start + wi
            const isActive = idx === activeIdx
            const isPast   = idx < activeIdx
            return (
              <span
                key={wi}
                ref={isActive ? activeWordRef : undefined}
                style={isActive ? { color: 'var(--theme-accent, #22d3ee)' } : undefined}
                className={clsx(
                  'transition-colors duration-100',
                  isActive ? 'font-semibold' : isPast ? 'text-slate-500' : 'text-slate-200',
                )}
              >
                {word}{' '}
              </span>
            )
          })}
        </p>
      ))}
    </div>
  )
}

// ── Quiz panel ────────────────────────────────────────────────────────────

function QuizPanel({ questions, taskId }: { questions: QuizQuestion[]; taskId: string }) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState<Record<number, boolean>>({})
  const [results, setResults] = useState<Record<number, boolean>>({})
  const [intervals, setIntervals] = useState<Record<number, number>>({})
  const [showSummary, setShowSummary] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const engagedAt = useRef<Record<number, number>>({})

  const q = questions[idx]
  const isSubmitted = submitted[idx]
  const isCorrect = results[idx]
  const selectedAnswer = answers[idx] ?? ''
  const isLast = idx === questions.length - 1
  const doneCount = Object.keys(submitted).length
  const correctCount = Object.values(results).filter(Boolean).length

  const handleSelect = (opt: string) => {
    if (isSubmitted) return
    if (!engagedAt.current[idx]) engagedAt.current[idx] = Date.now()
    setAnswers((a) => ({ ...a, [idx]: opt }))
  }

  const handleSubmit = async () => {
    if (!selectedAnswer || submitting) return
    setSubmitting(true)
    const responseTimeMs = engagedAt.current[idx]
      ? Date.now() - engagedAt.current[idx]
      : undefined
    try {
      const res = await vocabularyApi.submitQuiz(q.word, selectedAnswer, q.correct_answer, taskId, responseTimeMs)
      setSubmitted((s) => ({ ...s, [idx]: true }))
      setResults((r) => ({ ...r, [idx]: res.data.is_correct }))
      setIntervals((v) => ({ ...v, [idx]: res.data.new_interval }))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to submit answer.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleNext = () => {
    if (isLast) { setShowSummary(true) } else { setIdx((i) => i + 1) }
  }

  const handleRetake = () => {
    setIdx(0)
    setAnswers({})
    setSubmitted({})
    setResults({})
    setIntervals({})
    setShowSummary(false)
    engagedAt.current = {}
  }

  if (showSummary) {
    const pct = Math.round((correctCount / questions.length) * 100)
    const grade =
      pct >= 80 ? { label: 'Excellent!',       color: 'text-emerald-300', ring: 'border-emerald-400/30 bg-emerald-500/10' } :
      pct >= 60 ? { label: 'Good job!',         color: 'text-cyan-300',    ring: 'border-cyan-400/30    bg-cyan-500/10'    } :
      pct >= 40 ? { label: 'Keep practising!',  color: 'text-amber-300',   ring: 'border-amber-400/30   bg-amber-500/10'   } :
                  { label: 'Keep going!',        color: 'text-slate-300',   ring: 'border-white/20        bg-white/[0.05]'  }
    return (
      <div className="animate-fade-in">
        {/* Score */}
        <div className="text-center mb-6">
          <div className={clsx('w-20 h-20 rounded-3xl mx-auto mb-4 flex flex-col items-center justify-center border', grade.ring)}>
            <span className={clsx('text-2xl font-extrabold tabular-nums leading-none', grade.color)}>{pct}%</span>
            <span className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">score</span>
          </div>
          <h3 className={clsx('text-xl font-bold', grade.color)}>{grade.label}</h3>
          <p className="text-sm text-slate-400 mt-1">
            {correctCount} of {questions.length} correct · SM-2 intervals updated
          </p>
        </div>

        {/* Per-question review */}
        <div className="space-y-2 mb-5">
          {questions.map((question, i) => (
            <div
              key={i}
              className={clsx(
                'flex items-start gap-3 px-4 py-3 rounded-2xl border',
                results[i] ? 'border-emerald-400/15 bg-emerald-500/[0.05]' : 'border-rose-400/15 bg-rose-500/[0.05]',
              )}
            >
              <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                results[i] ? 'bg-emerald-500/20' : 'bg-rose-500/20'
              )}>
                {results[i]
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
                  : <XCircle className="w-3.5 h-3.5 text-rose-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{question.word}</span>
                  {results[i] && intervals[i] !== undefined && (
                    <span className="text-[10px] text-emerald-400/70 border border-emerald-400/20 rounded-full px-1.5 py-0.5">
                      next in {intervals[i]}d
                    </span>
                  )}
                </div>
                {!results[i] && (
                  <p className="text-xs text-slate-400 mt-0.5 leading-5">
                    You answered: <span className="text-rose-300">"{answers[i] || '—'}"</span>
                    {' · '}Correct: <span className="text-emerald-300">"{question.correct_answer}"</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleRetake}
          className="w-full py-3 rounded-2xl border border-white/10 bg-white/[0.04] text-slate-200 text-sm font-semibold hover:bg-white/[0.08] active:scale-[0.99] transition-all"
        >
          Retake Quiz
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Progress */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
          {idx + 1} / {questions.length}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${((doneCount) / questions.length) * 100}%`,
              background: 'linear-gradient(90deg, #22d3ee 0%, #a78bfa 100%)',
            }}
          />
        </div>
        <span className="text-[11px] font-semibold text-emerald-300 shrink-0 tabular-nums">
          {correctCount} ✓
        </span>
      </div>

      {/* Question */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-300 border border-cyan-400/15">
            {q.question_type.replace(/_/g, ' ')}
          </span>
          <span className="text-xs text-slate-500 font-semibold">{q.word}</span>
        </div>
        <p className="text-base font-semibold text-white leading-7">{q.question}</p>
      </div>

      {/* Answer options */}
      {q.options ? (
        <div className={clsx(
          'grid gap-2.5',
          q.options.length === 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
        )}>
          {q.options.map((opt) => {
            const isSelected = selectedAnswer === opt
            const isCorrectOpt = isSubmitted && opt === q.correct_answer
            const isWrongPick = isSubmitted && isSelected && !isCorrect
            return (
              <button
                key={opt}
                type="button"
                disabled={isSubmitted}
                onClick={() => handleSelect(opt)}
                className={clsx(
                  'px-4 py-3.5 text-sm font-medium text-left transition-all duration-150 border',
                  'rounded-2xl',
                  isCorrectOpt
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 cursor-default'
                    : isWrongPick
                      ? 'border-rose-400/40 bg-rose-500/15 text-rose-200 cursor-default'
                      : isSubmitted
                        ? 'border-white/[0.06] bg-transparent text-slate-600 cursor-not-allowed'
                        : isSelected
                          ? 'border-cyan-400/40 bg-cyan-400/10 text-white shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:border-white/20 hover:text-white',
                )}
              >
                {isCorrectOpt && <CheckCircle className="w-3.5 h-3.5 inline mr-2 text-emerald-300" />}
                {isWrongPick  && <XCircle     className="w-3.5 h-3.5 inline mr-2 text-rose-300"    />}
                {opt}
              </button>
            )
          })}
        </div>
      ) : (
        <input
          type="text"
          disabled={isSubmitted}
          value={selectedAnswer}
          onChange={(e) => handleSelect(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !isSubmitted) handleSubmit() }}
          placeholder="Type your answer…"
          className="w-full px-4 py-3.5 rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 transition-all"
          autoFocus
        />
      )}

      {/* Feedback + action */}
      {isSubmitted ? (
        <div className="mt-4 space-y-3">
          <div className={clsx(
            'flex items-start gap-3 px-4 py-3 rounded-2xl border',
            isCorrect
              ? 'border-emerald-400/25 bg-emerald-500/[0.08]'
              : 'border-rose-400/25 bg-rose-500/[0.08]',
          )}>
            {isCorrect
              ? <CheckCircle className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
              : <XCircle     className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />}
            <div>
              <p className={clsx('text-sm font-semibold', isCorrect ? 'text-emerald-300' : 'text-rose-300')}>
                {isCorrect ? `Correct! Next review in ${intervals[idx] ?? '?'} day(s).` : 'Not quite.'}
              </p>
              {!isCorrect && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Correct answer: <span className="font-semibold text-white">"{q.correct_answer}"</span>
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="w-full py-3 rounded-2xl bg-cyan-400 text-slate-950 font-semibold text-sm hover:bg-cyan-300 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            {isLast ? 'See Results' : 'Next Question'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selectedAnswer || submitting}
          className="mt-4 w-full py-3 rounded-2xl bg-cyan-400 text-slate-950 font-semibold text-sm hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-all"
        >
          {submitting ? 'Checking…' : 'Submit Answer'}
        </button>
      )}
    </div>
  )
}

// ── Processing table (used in loading state) ──────────────────────────────

function ProcessingTable({ stepDetails }: { stepDetails: TaskStepDetails }) {
  return (
    <div className="grid gap-1.5 mt-5">
      {ORDERED_STEPS.map((key) => {
        const step = stepDetails[key]
        const Icon = STEP_ICONS[key] ?? Zap
        const s = step.status
        return (
          <div
            key={key}
            className={clsx(
              'border transition-all duration-300',
              s === 'running' && 'border-cyan-400/30 bg-cyan-400/[0.05] shadow-[0_0_14px_rgba(34,211,238,0.07)]',
              s === 'done'    && 'border-emerald-400/15 bg-emerald-500/[0.04]',
              s === 'failed'  && 'border-rose-400/15 bg-rose-500/[0.04]',
              s === 'skipped' && 'border-amber-400/15 bg-amber-500/[0.04]',
              s === 'waiting' && 'border-white/[0.06] bg-transparent',
            )}
            style={{ borderRadius: 'calc(var(--theme-radius, 28px) - 12px)' }}
          >
            <div className="px-4 py-3 flex items-center gap-3">
              <div className={clsx(
                'w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 transition-all duration-300',
                s === 'running' && 'border-cyan-400/25 bg-cyan-400/10',
                s === 'done'    && 'border-emerald-400/20 bg-emerald-500/10',
                s === 'failed'  && 'border-rose-400/20 bg-rose-500/10',
                s === 'skipped' && 'border-amber-400/15 bg-amber-500/[0.08]',
                s === 'waiting' && 'border-white/10 bg-white/[0.03]',
              )}>
                {s === 'done'    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-300" /> :
                 s === 'failed'  ? <XCircle className="w-3.5 h-3.5 text-rose-300" /> :
                 s === 'running' ? <Icon className="w-3.5 h-3.5 text-cyan-300 animate-pulse" /> :
                 <Icon className={clsx('w-3.5 h-3.5', s === 'waiting' ? 'text-slate-700' : 'text-slate-500')} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={clsx(
                  'text-sm font-medium transition-colors duration-300',
                  s === 'running' ? 'text-cyan-200' :
                  s === 'done'    ? 'text-slate-200' :
                  s === 'failed'  ? 'text-rose-300' :
                  s === 'skipped' ? 'text-amber-300/80' :
                  'text-slate-600'
                )}>
                  {STEP_LABELS[key] ?? key}
                </p>
                <p className="text-xs mt-0.5">
                  {s === 'running'
                    ? <span className="text-cyan-500/60">In progress…</span>
                    : <span className="text-slate-600">{typeof step.seconds === 'number' ? `${step.seconds.toFixed(2)}s` : '—'}</span>}
                </p>
              </div>
              <StepStatusBadge status={s} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Progress hero (loading state) ─────────────────────────────────────────

function ProgressHero({
  status, progressMessage, progressPercent, currentStep, stepDetails,
}: {
  status: string; progressMessage: string | null; progressPercent: number
  currentStep: string | null; stepDetails: TaskStepDetails | null
}) {
  const doneCount = stepDetails
    ? ORDERED_STEPS.filter((k) => stepDetails[k].status === 'done').length
    : 0

  return (
    <div className="max-w-2xl mx-auto py-8 animate-fade-in">
      <SurfaceCard className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-cyan-400/[0.06] blur-3xl animate-breathe" />
          <div className="absolute -bottom-10 right-6 w-56 h-56 rounded-full bg-fuchsia-500/[0.05] blur-3xl animate-float-slow" />
        </div>

        <div className="relative z-10 text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border border-cyan-400/20 animate-ping" style={{ animationDuration: '2.6s' }} />
            <div className="absolute inset-1.5 rounded-full border border-cyan-400/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
            <div className="relative w-full h-full rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.08] to-fuchsia-500/[0.05] flex items-center justify-center">
              <Loader2 className="w-9 h-9 text-cyan-300 animate-spin" />
            </div>
          </div>

          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Analysing your image
          </h2>
          <p className="text-slate-400 text-sm md:text-base mt-3 max-w-sm mx-auto leading-7">
            {status === 'pending'
              ? 'Waiting in queue — the AI pipeline will start shortly.'
              : progressMessage || 'Running AI analysis pipeline…'}
          </p>

          <div className="mt-8 max-w-md mx-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-400 font-medium capitalize">
                {currentStep ? (STEP_LABELS[currentStep] ?? currentStep) : 'Preparing…'}
              </span>
              <span
                className="text-3xl font-bold tabular-nums leading-none"
                style={{
                  background: 'linear-gradient(90deg, #22d3ee 0%, #a78bfa 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {progressPercent}%
              </span>
            </div>

            <div className="relative h-3.5 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                style={{
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, #22d3ee 0%, #3b82f6 50%, #a78bfa 100%)',
                  minWidth: progressPercent > 0 ? '14px' : '0',
                }}
              >
                <div
                  className="absolute inset-0 animate-shimmer pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%)',
                    backgroundSize: '300% 100%',
                  }}
                />
              </div>
            </div>

            <div
              className="h-2 rounded-full blur-sm mt-0.5 transition-all duration-700 ease-out pointer-events-none"
              style={{
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, rgba(34,211,238,0.38) 0%, rgba(59,130,246,0.35) 50%, rgba(167,139,250,0.38) 100%)',
              }}
            />

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {doneCount} / {ORDERED_STEPS.length} steps complete
              </span>
              <StatusBadge status={status} />
            </div>
          </div>

          {stepDetails && (
            <div className="mt-6 text-left">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-600 mb-2 pl-1">
                Pipeline Steps
              </p>
              <ProcessingTable stepDetails={stepDetails} />
            </div>
          )}
        </div>
      </SurfaceCard>
    </div>
  )
}

// ── Dashboard components ──────────────────────────────────────────────────

function QuizModal({ questions, taskId, onClose }: {
  questions: QuizQuestion[]
  taskId: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Vocabulary Quiz"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] flex flex-col overflow-hidden border-0 sm:border border-white/10 bg-[#040d1c] shadow-2xl"
        style={{ borderRadius: 'var(--theme-radius, 28px)' }}
      >
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <GraduationCap className="w-4 h-4 text-cyan-300 shrink-0" />
          <span className="text-sm font-bold text-white flex-1">Vocabulary Quiz</span>
          <span className="text-xs text-slate-500 hidden sm:block">SM-2 spaced repetition</span>
          <button
            onClick={onClose}
            className="w-11 h-11 sm:w-8 sm:h-8 rounded-xl bg-white/[0.05] hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
            aria-label="Close quiz"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <QuizPanel questions={questions} taskId={taskId} />
        </div>
      </div>
    </div>
  )
}

function DetectionOverlayImage({ imageUrl, detections }: {
  imageUrl: string
  detections: DetectionObject[]
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className="relative w-full h-full">
      <img
        src={imageUrl}
        alt="Annotated analysis result"
        className="absolute inset-0 w-full h-full object-contain"
        style={{
          borderRadius: 'calc(var(--theme-radius, 28px) - 8px)',
          filter: 'brightness(1.05) contrast(1.04)',
        }}
        onLoad={(e) => {
          const img = e.currentTarget
          setDims({ w: img.naturalWidth, h: img.naturalHeight })
        }}
      />
      {dims && detections.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-auto"
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {detections.map((d, i) => {
            const [x1, y1, x2, y2] = d.bounding_box
            const isH = hovered === i
            return (
              <g key={i}>
                <rect
                  x={x1} y={y1}
                  width={x2 - x1} height={y2 - y1}
                  fill={isH ? 'rgba(34,211,238,0.08)' : 'transparent'}
                  stroke={isH ? 'rgba(34,211,238,0.85)' : 'rgba(255,255,255,0)'}
                  strokeWidth={isH ? 2.5 : 0}
                  rx="3"
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
                {isH && (
                  <text
                    x={x1 + 6}
                    y={Math.max(y1 + 20, 22)}
                    fill="rgba(34,211,238,1)"
                    fontSize={Math.min(16, Math.max(11, (x2 - x1) / 8))}
                    fontWeight="700"
                    paintOrder="stroke"
                    stroke="rgba(0,0,0,0.85)"
                    strokeWidth="3"
                    className="pointer-events-none select-none"
                  >
                    {d.label} {(d.confidence * 100).toFixed(0)}%
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

function MiniCard({ icon: Icon, title, count, accentClass, children, ariaLabel, autoHeight = false }: {
  icon: ComponentType<{ className?: string }>
  title: string
  count?: number | string
  accentClass?: string
  children: ReactNode
  ariaLabel: string
  autoHeight?: boolean
}) {
  return (
    <section
      aria-label={ariaLabel}
      className="flex flex-col border border-white/10 bg-white/[0.03] overflow-hidden"
      style={{ borderRadius: 'calc(var(--theme-radius, 28px) - 10px)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] shrink-0">
        <Icon className={clsx('w-3.5 h-3.5 shrink-0', accentClass ?? 'text-slate-400')} />
        <span className="text-xs font-semibold text-slate-200 flex-1 min-w-0 truncate">{title}</span>
        {count !== undefined && (
          <span className={clsx(
            'text-[10px] font-bold rounded-full px-1.5 py-0.5 border shrink-0',
            accentClass
              ? `bg-white/[0.06] border-white/10 ${accentClass}`
              : 'bg-white/[0.06] border-white/10 text-slate-400',
          )}>
            {count}
          </span>
        )}
      </div>
      <div className={clsx(
        'p-3',
        autoHeight ? 'overflow-y-auto max-h-[130px]' : 'flex-1 min-h-0 overflow-y-auto',
      )}>
        {children}
      </div>
    </section>
  )
}

function StoryTabsCard({ stories, failedStories, onQuizClick, hasQuiz, audioCurrent, audioDuration }: {
  stories: StoryResult[]
  failedStories: StoryResult[]
  onQuizClick: () => void
  hasQuiz: boolean
  audioCurrent: number
  audioDuration: number
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const story = stories[Math.min(activeIdx, Math.max(stories.length - 1, 0))]
  const wordCount = story ? story.content.trim().split(/\s+/).length : 0

  return (
    <section
      aria-label="AI-Generated Stories"
      className="flex flex-col border border-white/10 bg-white/[0.03] overflow-hidden lg:flex-1 lg:min-h-0"
      style={{ borderRadius: 'calc(var(--theme-radius, 28px) - 10px)' }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05] shrink-0">
        <BookOpen className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" />
        <span className="text-xs font-semibold text-slate-200 flex-1">AI Stories</span>
        {stories.length > 0 && (
          <span className="text-[10px] text-slate-500 shrink-0">
            {stories.length} stor{stories.length === 1 ? 'y' : 'ies'}
          </span>
        )}
      </div>

      {stories.length > 1 && (
        <div className="flex border-b border-white/[0.05] shrink-0">
          {stories.map((s, i) => {
            const label = STORY_TYPE_LABELS[s.story_type as keyof typeof STORY_TYPE_LABELS] ?? s.story_type
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={clsx(
                  'flex-1 px-2 py-2 text-[11px] font-medium truncate transition-colors border-b-2 -mb-px',
                  activeIdx === i
                    ? 'text-cyan-300 border-cyan-400'
                    : 'text-slate-500 border-transparent hover:text-slate-300',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 lg:min-h-[120px]">
        {story ? (
          <KaraokeStory content={story.content} currentTime={audioCurrent} duration={audioDuration} />
        ) : failedStories.length > 0 ? (
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200 leading-5">
              Story generation failed. Try re-analysing the image.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No stories available.</p>
        )}
      </div>

      {(story || hasQuiz) && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.05] shrink-0">
          <span className="text-[10px] text-slate-600">
            {story ? `${wordCount} words` : ''}
            {story && stories.length === 1
              ? ` · ${STORY_TYPE_LABELS[story.story_type as keyof typeof STORY_TYPE_LABELS] ?? story.story_type}`
              : ''}
          </span>
          {hasQuiz && (
            <button
              type="button"
              onClick={onQuizClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-400/10 border border-cyan-400/25 text-cyan-300 text-[11px] font-semibold hover:bg-cyan-400/20 active:scale-95 transition-all"
            >
              Take Quiz <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </section>
  )
}

// ── Result dashboard ──────────────────────────────────────────────────────

function ResultDashboard({ result, taskId }: { result: AnalysisResult; taskId: string }) {
  const [showQuiz, setShowQuiz]           = useState(false)
  const [audioCurrent, setAudioCurrent]   = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)

  const validStories = useMemo(
    () => result.stories?.filter((s) => !isStoryFailure(s.content)) ?? [],
    [result],
  )
  const failedStories = useMemo(
    () => result.stories?.filter((s) => isStoryFailure(s.content)) ?? [],
    [result],
  )

  const detections = result.detections ?? []
  const emotions = result.emotions ?? []
  const hasQuiz = (result.quiz_questions?.length ?? 0) > 0
  const hasStories = validStories.length > 0 || failedStories.length > 0

  return (
    <>
      {showQuiz && result.quiz_questions && (
        <QuizModal
          questions={result.quiz_questions}
          taskId={taskId}
          onClose={() => setShowQuiz(false)}
        />
      )}

      {/* On mobile the container grows with content and the page scrolls normally.
          From lg: up it becomes a single-screen dashboard (h-full + overflow-hidden),
          relying on internal overflow-y-auto in each card instead of page scroll. */}
      <div className="flex flex-col gap-3 animate-fade-in overflow-y-auto lg:h-full lg:overflow-hidden">

        {/* ── Header bar ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-200">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              Analysis Complete
            </div>
            <StatusBadge status={result.status} />
            {result.processing_ms && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Clock3 className="w-3 h-3" aria-hidden="true" />
                {(result.processing_ms / 1000).toFixed(1)}s total
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {[
              { icon: Layers,       label: 'Objects',  value: detections.length,              accent: 'text-cyan-300'    },
              { icon: Smile,        label: 'Emotions', value: emotions.length,                accent: 'text-amber-300'   },
              { icon: BookOpen,     label: 'Stories',  value: validStories.length,            accent: 'text-fuchsia-300' },
              { icon: GraduationCap, label: 'Quiz',   value: result.quiz_questions?.length ?? 0, accent: 'text-emerald-300' },
            ].map(({ icon: Icon, label, value, accent }) => (
              <div
                key={label}
                className="hidden sm:flex items-center gap-1.5 border border-white/10 bg-white/[0.03] rounded-xl px-2.5 py-1.5"
              >
                <Icon className={clsx('w-3 h-3 shrink-0', accent)} aria-hidden="true" />
                <span className="text-[11px] font-semibold text-white tabular-nums">{value}</span>
                <span className="text-[10px] text-slate-500 hidden md:inline">{label}</span>
              </div>
            ))}
            <Link
              to="/analyse"
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.04] text-xs font-medium transition-colors"
            >
              New Analysis
            </Link>
            <Link
              to="/progress"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 text-xs font-semibold hover:bg-cyan-400/20 transition-colors"
            >
              Progress <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* ── Main grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-3 lg:flex-1 lg:min-h-0 lg:overflow-hidden">

          {/* ── Left column: image + audio ───────────────────────── */}
          <div
            className="flex flex-col gap-3 lg:overflow-hidden"
            role="region"
            aria-label="Analysis image"
          >
            {/* Image with SVG bbox overlay */}
            <div
              className="relative border border-white/10 bg-black/20 overflow-hidden min-h-[280px] lg:flex-1 lg:min-h-0"
              style={{ borderRadius: 'calc(var(--theme-radius, 28px) - 4px)' }}
            >
              {result.annotated_image_url ? (
                <>
                  <DetectionOverlayImage
                    imageUrl={`${API_BASE}${result.annotated_image_url}`}
                    detections={detections}
                  />
                  {detections.length > 0 && (
                    <div className="absolute bottom-2 right-2 rounded-lg bg-black/50 backdrop-blur-sm px-2 py-1 text-[10px] text-slate-400 pointer-events-none select-none">
                      Hover to identify objects
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm">
                  No image available
                </div>
              )}
            </div>

            {/* Audio player */}
            {result.audio_url && (
              <div
                className="shrink-0 border border-white/10 bg-white/[0.03] px-4 py-3"
                style={{ borderRadius: 'calc(var(--theme-radius, 28px) - 4px)' }}
                role="region"
                aria-label="Audio narration"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
                  <span className="text-xs font-semibold text-slate-200">Audio Narration</span>
                </div>
                <audio
                  controls
                  src={`${API_BASE}${result.audio_url}`}
                  className="w-full h-8"
                  aria-label="Story audio narration"
                  onTimeUpdate={(e) => {
                    const el = e.currentTarget
                    setAudioCurrent(el.currentTime)
                    if (el.duration > 0) setAudioDuration(el.duration)
                  }}
                  onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
                  onEnded={() => setAudioCurrent(0)}
                />
              </div>
            )}
          </div>

          {/* ── Right column: data cards + stories ──────────────── */}
          <div
            className="flex flex-col gap-3 lg:overflow-hidden"
            role="region"
            aria-label="Analysis results"
          >
            {/* Row 1 — compact: Objects + Emotions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0 h-auto sm:h-[88px]">

              <MiniCard
                icon={Layers}
                title="Objects"
                count={detections.length}
                accentClass="text-cyan-300"
                ariaLabel="Detected objects"
              >
                {detections.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {detections.map((d, i) => (
                      <span
                        key={i}
                        className={clsx(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border',
                          confidenceBadgeColor(d.confidence),
                        )}
                        title={`${(d.confidence * 100).toFixed(0)}% confidence`}
                      >
                        {d.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 text-[11px]">No objects detected</p>
                )}
              </MiniCard>

              <MiniCard
                icon={Smile}
                title="Emotions"
                count={emotions.length}
                accentClass="text-amber-300"
                ariaLabel="Emotion analysis results"
              >
                {emotions.length > 0 ? (
                  <div className="space-y-1">
                    {emotions.map((e, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-slate-300 text-[11px] truncate">{e.child_friendly_label}</span>
                        <span className="text-amber-300 text-[10px] font-semibold shrink-0">
                          {(e.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 text-[11px]">No faces detected</p>
                )}
              </MiniCard>

            </div>

            {/* Row 2 — auto-height: Text (OCR) + Scene (shrinks when content is short) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">

              <MiniCard
                icon={ScanText}
                title="Text (OCR)"
                count={result.ocr?.raw_text ? '✓' : undefined}
                accentClass="text-violet-300"
                ariaLabel="OCR text extraction"
                autoHeight
              >
                {result.ocr?.raw_text ? (
                  <p className="text-slate-300 text-[11px] font-mono leading-5 break-words">
                    {result.ocr.raw_text}
                  </p>
                ) : (
                  <p className="text-slate-600 text-[11px]">No text found</p>
                )}
              </MiniCard>

              <MiniCard
                icon={Sparkles}
                title="Scene"
                accentClass="text-fuchsia-300"
                ariaLabel="Scene description"
                autoHeight
              >
                {result.scene?.description ? (
                  <p className="text-slate-300 text-[11px] leading-5">
                    {result.scene.description.split('\n\n')[0].replace(/\*\*/g, '')}
                  </p>
                ) : (
                  <p className="text-slate-600 text-[11px]">No scene description</p>
                )}
              </MiniCard>

            </div>

            {/* Story tabs (fills remaining height on xl+) */}
            {hasStories && (
              <StoryTabsCard
                stories={validStories}
                failedStories={failedStories}
                onQuizClick={() => setShowQuiz(true)}
                hasQuiz={hasQuiz}
                audioCurrent={audioCurrent}
                audioDuration={audioDuration}
              />
            )}

            {/* Standalone quiz button when no stories exist */}
            {!hasStories && hasQuiz && (
              <div className="shrink-0 flex items-center justify-between border border-white/10 bg-white/[0.03] px-4 py-3"
                style={{ borderRadius: 'calc(var(--theme-radius, 28px) - 4px)' }}
              >
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-300" />
                  <span className="text-sm text-slate-200 font-medium">
                    {result.quiz_questions!.length} vocabulary question{result.quiz_questions!.length !== 1 ? 's' : ''} ready
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuiz(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 text-sm font-semibold hover:bg-cyan-300 active:scale-95 transition-all"
                >
                  Take Quiz <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile-only footer links */}
        <div className="flex gap-3 lg:hidden shrink-0 pt-1 pb-2">
          <Link
            to="/analyse"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] text-sm font-medium transition-colors"
          >
            Analyse Another Image
          </Link>
          <Link
            to="/progress"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-cyan-400 text-slate-950 text-sm font-semibold hover:bg-cyan-300 transition-colors"
          >
            View Progress <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </>
  )
}

// ── Page entry point ──────────────────────────────────────────────────────

export default function ResultPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const { result, status, currentStep, progressMessage, stepDetails, displayPercent, error } =
    useTaskPolling(taskId)

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-16 animate-fade-in">
        <SurfaceCard>
          <div className="text-center">
            <div className="w-16 h-16 rounded-3xl border border-rose-400/20 bg-rose-500/10 flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-8 h-8 text-rose-300" />
            </div>
            <h2 className="text-2xl font-bold text-white">Analysis failed</h2>
            <p className="text-slate-400 text-sm mt-3 leading-7 max-w-sm mx-auto">{error}</p>
            <div className="mt-6">
              <Link
                to="/analyse"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-semibold hover:bg-cyan-300 transition-colors"
              >
                Try Again
              </Link>
            </div>
          </div>
        </SurfaceCard>
      </div>
    )
  }

  if (!result) {
    return (
      <ProgressHero
        status={status}
        progressMessage={progressMessage}
        progressPercent={displayPercent}
        currentStep={currentStep}
        stepDetails={stepDetails}
      />
    )
  }

  return <ResultDashboard result={result} taskId={taskId!} />
}
