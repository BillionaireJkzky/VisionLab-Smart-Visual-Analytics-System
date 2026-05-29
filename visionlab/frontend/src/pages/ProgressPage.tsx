import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  BookOpen,
  Loader2,
  Calendar,
  Brain,
  Clock3,
  Trophy,
  Search,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getApiErrorMessage, vocabularyApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import type { VocabularyProgressItem } from '../types/api'
import { SurfaceCard } from '../components/ui'
import clsx from 'clsx'

const DIFFICULTY_STYLES: Record<string, string> = {
  beginner:
    'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
  intermediate:
    'bg-amber-500/15 text-amber-300 border border-amber-400/20',
  advanced:
    'bg-rose-500/15 text-rose-300 border border-rose-400/20',
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accentClass,
}: {
  title: string
  value: number
  subtitle: string
  icon: ComponentType<{ className?: string }>
  accentClass: string
}) {
  return (
    <SurfaceCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{title}</p>
          <p className={clsx('mt-3 text-4xl font-bold tracking-tight', accentClass)}>{value}</p>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>

        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <Icon className={clsx('w-5 h-5', accentClass)} />
        </div>
      </div>
    </SurfaceCard>
  )
}

export default function ProgressPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<VocabularyProgressItem[]>([])
  const [totalWords, setTotalWords] = useState(0)
  const [dueCount, setDueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!user) return

    Promise.all([
      vocabularyApi.getProgress(user.id),
      vocabularyApi.getReview(user.id),
    ])
      .then(([prog, review]) => {
        setItems(prog.data.items)
        setTotalWords(prog.data.total_words)
        setDueCount(review.data.due_words.length)
      })
      .catch((error: unknown) => {
        toast.error(getApiErrorMessage(error, 'Could not load your progress right now.'))
      })
      .finally(() => setLoading(false))
  }, [user])

  const masteredCount = useMemo(
    () => items.filter((item) => item.repetitions >= 5).length,
    [items]
  )

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.word.toLowerCase().includes(q) ||
        item.difficulty.toLowerCase().includes(q)
    )
  }, [items, query])

  const upcomingWord = useMemo(() => {
    if (!items.length) return null
    return [...items].sort(
      (a, b) =>
        new Date(a.next_review_at).getTime() -
        new Date(b.next_review_at).getTime()
    )[0]
  }, [items])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite" aria-busy="true">
          <div className="w-16 h-16 rounded-3xl border border-white/10 bg-white/[0.04] flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-cyan-300 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Loading your learning progress</p>
            <p className="text-sm text-slate-400 mt-1">Please wait a moment...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <section
        className="relative overflow-hidden border border-white/10 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-fuchsia-500/10 shadow-2xl mb-8"
        style={{ borderRadius: 'var(--theme-radius)' }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-14 right-0 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-72 h-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 p-6 md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            My Progress
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                Build your vocabulary,
                <br />
                track your growth
              </h1>
              <p className="mt-4 max-w-2xl text-slate-300 leading-7">
                Monitor the words you’ve learned from image analysis, review upcoming practice,
                and build stronger recall over time with spaced repetition.
              </p>
            </div>

            <div
              className="border border-white/10 bg-white/[0.05] backdrop-blur-xl"
              style={{ borderRadius: 'var(--theme-radius)' }}
            >
              <div className="p-5">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400 mb-2">
                  Next focus
                </p>

                {upcomingWord ? (
                  <>
                    <p className="text-2xl font-bold text-white capitalize">{upcomingWord.word}</p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize',
                          DIFFICULTY_STYLES[upcomingWord.difficulty] ??
                            'bg-slate-500/15 text-slate-300 border border-white/10'
                        )}
                      >
                        {upcomingWord.difficulty}
                      </span>
                      <span className="text-sm text-slate-400">
                        Review on {new Date(upcomingWord.next_review_at).toLocaleDateString()}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-300">No words scheduled yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatCard
          title="Total Words"
          value={totalWords}
          subtitle="Words collected from your image analyses"
          icon={BookOpen}
          accentClass="text-cyan-300"
        />
        <StatCard
          title="Due for Review"
          value={dueCount}
          subtitle="Words ready for your next review session"
          icon={Clock3}
          accentClass="text-amber-300"
        />
        <StatCard
          title="Mastered"
          value={masteredCount}
          subtitle="Words with strong repetition progress"
          icon={Trophy}
          accentClass="text-emerald-300"
        />
      </section>

      {items.length === 0 ? (
        <div
          className="border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl text-center"
          style={{ borderRadius: 'var(--theme-radius)' }}
        >
          <div className="py-16 px-6">
            <div className="mx-auto w-16 h-16 rounded-3xl border border-white/10 bg-white/[0.05] flex items-center justify-center mb-5">
              <Brain className="w-7 h-7 text-cyan-300" />
            </div>

            <h2 className="text-2xl font-bold text-white">Your vocabulary journey starts here</h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto leading-7">
              Analyse images to automatically discover objects, words, and useful vocabulary.
              Once you do, your learning progress will appear here.
            </p>
          </div>
        </div>
      ) : (
        <section
          className="border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl"
          style={{ borderRadius: 'var(--theme-radius)' }}
        >
          <div className="p-5 md:p-6 border-b border-white/10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Vocabulary Library</h2>
                <p className="text-slate-400 mt-1">
                  Review your collected words, difficulty level, and next study date.
                </p>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search words or difficulty..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 pl-10 pr-4 py-3 outline-none focus:border-cyan-400/30"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]" role="table" aria-label="Vocabulary progress table">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]">
                    Word
                  </th>
                  <th className="text-left py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]">
                    Level
                  </th>
                  <th className="text-center py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]">
                    Reps
                  </th>
                  <th className="text-center py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]">
                    Interval
                  </th>
                  <th className="text-left py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-[0.16em]">
                    Next Review
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item, index) => (
                  <tr
                    key={item.word}
                    className={clsx(
                      'border-b border-white/5 transition-colors',
                      index % 2 === 0 ? 'bg-white/[0.015]' : 'bg-transparent',
                      'hover:bg-white/[0.05]'
                    )}
                  >
                    <td className="py-4 px-6">
                      <div>
                        <p className="font-semibold text-white capitalize">{item.word}</p>
                        <p className="text-xs text-slate-500 mt-1">Vocabulary item</p>
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize',
                          DIFFICULTY_STYLES[item.difficulty] ??
                            'bg-slate-500/15 text-slate-300 border border-white/10'
                        )}
                      >
                        {item.difficulty}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="text-white font-medium">{item.repetitions}</span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="text-slate-300">{item.interval}d</span>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Calendar className="w-4 h-4 text-slate-500" aria-hidden="true" />
                        {new Date(item.next_review_at).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredItems.length === 0 && (
            <div className="px-6 py-12 text-center border-t border-white/10">
              <p className="text-white font-medium">No matching vocabulary found</p>
              <p className="text-sm text-slate-400 mt-2">
                Try another search term or clear your search.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}