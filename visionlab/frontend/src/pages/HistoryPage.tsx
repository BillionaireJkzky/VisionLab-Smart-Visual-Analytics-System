import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock3,
  ChevronRight,
  Loader2,
  Trash2,
  XCircle,
  Sparkles,
  History,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Search,
  Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { analysisApi, getApiErrorMessage } from '../services/api'
import type { TaskStatusResponse } from '../types/api'
import { StatusBadge, SurfaceCard } from '../components/ui'
import clsx from 'clsx'

function SummaryCard({
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

export default function HistoryPage() {
  const [tasks, setTasks] = useState<TaskStatusResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [actionTaskId, setActionTaskId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const pendingDeleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed'>('all')

  const loadHistory = useCallback(async () => {
    try {
      const res = await analysisApi.getHistory()
      setTasks(res.data)
    } catch {
      toast.error('Failed to load history.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleCancel = async (taskId: string) => {
    setActionTaskId(taskId)
    try {
      await analysisApi.cancelTask(taskId)
      toast.success('Task cancelled.')
      await loadHistory()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to cancel task.'))
    } finally {
      setActionTaskId(null)
    }
  }

  const handleDelete = async (taskId: string) => {
    if (pendingDelete !== taskId) {
      if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current)
      setPendingDelete(taskId)
      pendingDeleteTimer.current = setTimeout(() => setPendingDelete(null), 3000)
      return
    }

    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current)
    setPendingDelete(null)
    setActionTaskId(taskId)
    try {
      await analysisApi.deleteTask(taskId)
      toast.success('Task deleted.')
      await loadHistory()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to delete task.'))
    } finally {
      setActionTaskId(null)
    }
  }

  const completedCount = useMemo(
    () => tasks.filter((t) => t.status === 'completed').length,
    [tasks]
  )

  const processingCount = useMemo(
    () => tasks.filter((t) => t.status === 'processing' || t.status === 'pending').length,
    [tasks]
  )

  const failedCount = useMemo(
    () => tasks.filter((t) => t.status === 'failed').length,
    [tasks]
  )

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase()

    return tasks.filter((task) => {
      const matchesFilter = filter === 'all' ? true : task.status === filter
      const matchesQuery =
        !q ||
        task.task_id.toLowerCase().includes(q) ||
        task.status.toLowerCase().includes(q) ||
        (task.original_filename?.toLowerCase().includes(q) ?? false)

      return matchesFilter && matchesQuery
    })
  }, [tasks, query, filter])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-3xl border border-white/10 bg-white/[0.04] flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-cyan-300 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Loading analysis history</p>
            <p className="text-sm text-slate-400 mt-1">Fetching your previous AI sessions...</p>
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
            Analysis History
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                Revisit your AI analyses,
                <br />
                compare every session
              </h1>
              <p className="mt-4 max-w-2xl text-slate-300 leading-7">
                Browse previous image analyses, track what completed successfully,
                revisit failed sessions, and continue learning from your AI-generated results.
              </p>
            </div>

            <div
              className="border border-white/10 bg-white/[0.05] backdrop-blur-xl"
              style={{ borderRadius: 'var(--theme-radius)' }}
            >
              <div className="p-5">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400 mb-2">
                  Latest activity
                </p>

                {tasks[0] ? (
                  <>
                    <p className="text-lg font-bold text-white truncate">
                      {tasks[0].original_filename ?? `Task ${tasks[0].task_id.slice(0, 8)}…`}
                    </p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <StatusBadge status={tasks[0].status} />
                      <span className="text-sm text-slate-400">
                        {new Date(tasks[0].created_at).toLocaleString()}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-300">No recent analysis yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <SummaryCard
          title="Completed"
          value={completedCount}
          subtitle="Finished analyses ready to revisit"
          icon={CheckCircle2}
          accentClass="text-emerald-300"
        />
        <SummaryCard
          title="In Progress"
          value={processingCount}
          subtitle="Tasks that are queued or still running"
          icon={Activity}
          accentClass="text-cyan-300"
        />
        <SummaryCard
          title="Failed"
          value={failedCount}
          subtitle="Sessions that need another try"
          icon={AlertTriangle}
          accentClass="text-rose-300"
        />
      </section>

      {tasks.length === 0 ? (
        <div
          className="border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl text-center"
          style={{ borderRadius: 'var(--theme-radius)' }}
        >
          <div className="py-16 px-6">
            <div className="mx-auto w-16 h-16 rounded-3xl border border-white/10 bg-white/[0.05] flex items-center justify-center mb-5">
              <History className="w-7 h-7 text-cyan-300" />
            </div>

            <h2 className="text-2xl font-bold text-white">No analysis history yet</h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto leading-7">
              Start your first image analysis to build a rich history of AI-powered insights,
              stories, audio, and learning progress.
            </p>

            <div className="mt-6">
              <Link to="/analyse" className="inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-semibold hover:bg-cyan-300 transition-colors">
                Analyse Your First Image
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <section
          className="border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl"
          style={{ borderRadius: 'var(--theme-radius)' }}
        >
          <div className="p-5 md:p-6 border-b border-white/10">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Analysis Timeline</h2>
                <p className="text-slate-400 mt-1">
                  Explore every uploaded image session and jump back into results instantly.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by task ID or status..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] text-white placeholder:text-slate-500 pl-10 pr-4 py-3 outline-none focus:border-cyan-400/30"
                  />
                </div>

                <div className="relative w-full sm:w-52">
                  <Filter className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as typeof filter)}
                    className="w-full appearance-none rounded-2xl border border-white/10 bg-white/[0.04] text-white pl-10 pr-4 py-3 outline-none focus:border-cyan-400/30"
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-5 space-y-4">
            {filteredTasks.map((t) => {
              const isWorking = actionTaskId === t.task_id
              const canCancel = t.status === 'pending' || t.status === 'processing'
              const canDelete = t.status === 'completed' || t.status === 'failed'

              return (
                <Link
                  key={t.task_id}
                  to={`/result/${t.task_id}`}
                  className="group block border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition-all shadow-xl"
                  style={{ borderRadius: 'var(--theme-radius)' }}
                >
                  <div className="p-5 md:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <Clock3 className="w-5 h-5 text-slate-400" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="font-semibold text-white text-base truncate">
                            {t.original_filename ?? `Task ${t.task_id.slice(0, 8)}…`}
                          </p>
                          <StatusBadge status={t.status} />
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
                          <span>{new Date(t.created_at).toLocaleString()}</span>
                          {t.processing_ms ? (
                            <span>Duration: {(t.processing_ms / 1000).toFixed(1)}s</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap lg:flex-nowrap">
                      {canCancel && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleCancel(t.task_id)
                          }}
                          disabled={isWorking}
                          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-rose-300 bg-rose-500/10 border border-rose-400/10 hover:bg-rose-500/15 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancel
                        </button>
                      )}

                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            void handleDelete(t.task_id)
                          }}
                          disabled={isWorking}
                          className={clsx(
                            'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium border disabled:opacity-50 transition-colors',
                            pendingDelete === t.task_id
                              ? 'text-white bg-rose-600/80 border-rose-500/50 hover:bg-rose-600'
                              : 'text-rose-300 bg-rose-500/10 border-rose-400/10 hover:bg-rose-500/15'
                          )}
                        >
                          <Trash2 className="w-4 h-4" />
                          {pendingDelete === t.task_id ? 'Confirm?' : 'Delete'}
                        </button>
                      )}

                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}

            {filteredTasks.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-white font-medium">No matching analysis found</p>
                <p className="text-sm text-slate-400 mt-2">
                  Try another search term or change the status filter.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}