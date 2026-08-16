import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  BookOpen,
  Loader2,
  Calendar,
  Brain,
  Clock3,
  Trophy,
  Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getApiErrorMessage, vocabularyApi } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import type { VocabularyProgressItem } from '../types/api'
import { SurfaceCard } from '../components/ui'
import clsx from 'clsx'

// Weight, not hue, signals difficulty — lightest to heaviest.
const DIFFICULTY_STYLES: Record<string, string> = {
  beginner:     'bg-paper text-ink-muted border-line-strong',
  intermediate: 'bg-caution-subtle text-caution border-line-strong',
  advanced:     'bg-ink text-paper border-ink',
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: number
  subtitle: string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <SurfaceCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-faint">{title}</p>
          <p className="mt-3 text-3xl font-mono font-semibold tracking-tight text-ink">{value}</p>
          <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>
        </div>
        <Icon className="w-4 h-4 text-ink-muted shrink-0 mt-1" aria-hidden="true" />
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
          <Loader2 className="w-6 h-6 text-ink-muted animate-spin" />
          <div className="text-center">
            <p className="text-ink font-medium">Loading your learning progress</p>
            <p className="text-sm text-ink-muted mt-1">Please wait a moment...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto animate-fade-in space-y-10">
      <header className="pb-8 border-b border-line">
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-8 items-start">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mb-4">
              My progress
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-medium text-ink leading-tight">
              Build your vocabulary, track your growth
            </h1>
            <p className="mt-4 max-w-2xl text-ink-muted leading-7">
              Monitor the words you’ve learned from image analysis, review upcoming practice,
              and build stronger recall over time with spaced repetition.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-paper-raised shadow-card p-5">
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-faint mb-3">
              Next focus
            </p>

            {upcomingWord ? (
              <>
                <p className="font-display text-2xl font-medium text-ink capitalize">{upcomingWord.word}</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded px-2.5 py-1 text-xs font-mono border capitalize',
                      DIFFICULTY_STYLES[upcomingWord.difficulty] ?? 'bg-paper text-ink-muted border-line-strong'
                    )}
                  >
                    {upcomingWord.difficulty}
                  </span>
                  <span className="text-sm text-ink-muted">
                    Review on {new Date(upcomingWord.next_review_at).toLocaleDateString()}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-ink-muted">No words scheduled yet.</p>
            )}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total words"
          value={totalWords}
          subtitle="Words collected from your image analyses"
          icon={BookOpen}
        />
        <StatCard
          title="Due for review"
          value={dueCount}
          subtitle="Words ready for your next review session"
          icon={Clock3}
        />
        <StatCard
          title="Mastered"
          value={masteredCount}
          subtitle="Words with strong repetition progress"
          icon={Trophy}
        />
      </section>

      {items.length === 0 ? (
        <div className="rounded-lg border border-line bg-paper-raised shadow-card text-center">
          <div className="py-16 px-6">
            <Brain className="w-6 h-6 text-ink-muted mx-auto mb-5" aria-hidden="true" />
            <h2 className="font-display text-2xl font-medium text-ink">Your vocabulary journey starts here</h2>
            <p className="mt-3 text-ink-muted max-w-xl mx-auto leading-7">
              Analyse images to automatically discover objects, words, and useful vocabulary.
              Once you do, your learning progress will appear here.
            </p>
          </div>
        </div>
      ) : (
        <section className="rounded-lg border border-line bg-paper-raised shadow-card">
          <div className="p-5 md:p-6 border-b border-line">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Vocabulary library</h2>
                <p className="text-sm text-ink-muted mt-1">
                  Review your collected words, difficulty level, and next study date.
                </p>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search words or difficulty..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded border border-line-strong bg-paper-raised text-ink placeholder:text-ink-faint pl-10 pr-4 py-2.5 text-sm outline-none transition-colors focus:border-ink"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]" role="table" aria-label="Vocabulary progress table">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left py-3 px-6 text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.14em]">
                    Word
                  </th>
                  <th className="text-left py-3 px-4 text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.14em]">
                    Level
                  </th>
                  <th className="text-center py-3 px-4 text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.14em]">
                    Reps
                  </th>
                  <th className="text-center py-3 px-4 text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.14em]">
                    Interval
                  </th>
                  <th className="text-left py-3 px-6 text-[11px] font-mono font-medium text-ink-faint uppercase tracking-[0.14em]">
                    Next review
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.word} className="border-b border-line hover:bg-paper transition-colors">
                    <td className="py-4 px-6">
                      <p className="font-medium text-ink capitalize">{item.word}</p>
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded px-2.5 py-1 text-xs font-mono border capitalize',
                          DIFFICULTY_STYLES[item.difficulty] ?? 'bg-paper text-ink-muted border-line-strong'
                        )}
                      >
                        {item.difficulty}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="text-ink font-mono text-sm">{item.repetitions}</span>
                    </td>

                    <td className="py-4 px-4 text-center">
                      <span className="text-ink-muted font-mono text-sm">{item.interval}d</span>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2 text-ink-muted text-sm">
                        <Calendar className="w-3.5 h-3.5 text-ink-faint" aria-hidden="true" />
                        {new Date(item.next_review_at).toLocaleDateString()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredItems.length === 0 && (
            <div className="px-6 py-12 text-center border-t border-line">
              <p className="text-ink font-medium">No matching vocabulary found</p>
              <p className="text-sm text-ink-muted mt-2">
                Try another search term or clear your search.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
