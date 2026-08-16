import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock3,
  ChevronRight,
  Loader2,
  Trash2,
  XCircle,
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
          <Loader2 className="w-6 h-6 text-ink-muted animate-spin" />
          <div className="text-center">
            <p className="text-ink font-medium">Loading analysis history</p>
            <p className="text-sm text-ink-muted mt-1">Fetching your previous sessions...</p>
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
              Analysis history
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-medium text-ink leading-tight">
              Revisit every session
            </h1>
            <p className="mt-4 max-w-2xl text-ink-muted leading-7">
              Browse previous image analyses, track what completed successfully, and revisit
              failed sessions.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-paper-raised shadow-card p-5">
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-faint mb-3">
              Latest activity
            </p>

            {tasks[0] ? (
              <>
                <p className="text-base font-medium text-ink truncate">
                  {tasks[0].original_filename ?? `Task ${tasks[0].task_id.slice(0, 8)}…`}
                </p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <StatusBadge status={tasks[0].status} />
                  <span className="text-sm text-ink-muted">
                    {new Date(tasks[0].created_at).toLocaleString()}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-ink-muted">No recent analysis yet.</p>
            )}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Completed"
          value={completedCount}
          subtitle="Finished analyses ready to revisit"
          icon={CheckCircle2}
        />
        <SummaryCard
          title="In progress"
          value={processingCount}
          subtitle="Tasks that are queued or still running"
          icon={Activity}
        />
        <SummaryCard
          title="Failed"
          value={failedCount}
          subtitle="Sessions that need another try"
          icon={AlertTriangle}
        />
      </section>

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-line bg-paper-raised shadow-card text-center">
          <div className="py-16 px-6">
            <History className="w-6 h-6 text-ink-muted mx-auto mb-5" aria-hidden="true" />
            <h2 className="font-display text-2xl font-medium text-ink">No analysis history yet</h2>
            <p className="mt-3 text-ink-muted max-w-xl mx-auto leading-7">
              Start your first image analysis to build a history of results, stories, audio,
              and learning progress.
            </p>
            <div className="mt-6">
              <Link to="/analyse" className="btn-primary">
                Analyse your first image
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <section className="rounded-lg border border-line bg-paper-raised shadow-card">
          <div className="p-5 md:p-6 border-b border-line">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Timeline</h2>
                <p className="text-sm text-ink-muted mt-1">
                  Every uploaded image session — jump back into results instantly.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by task ID or status..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded border border-line-strong bg-paper-raised text-ink placeholder:text-ink-faint pl-10 pr-4 py-2.5 text-sm outline-none transition-colors focus:border-ink"
                  />
                </div>

                <div className="relative w-full sm:w-52">
                  <Filter className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as typeof filter)}
                    className="w-full appearance-none rounded border border-line-strong bg-paper-raised text-ink pl-10 pr-4 py-2.5 text-sm outline-none transition-colors focus:border-ink"
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

          <div className="p-4 md:p-5 space-y-3">
            {filteredTasks.map((t) => {
              const isWorking = actionTaskId === t.task_id
              const canCancel = t.status === 'pending' || t.status === 'processing'
              const canDelete = t.status === 'completed' || t.status === 'failed'

              return (
                <Link
                  key={t.task_id}
                  to={`/result/${t.task_id}`}
                  className="group block rounded border border-line bg-paper-raised hover:border-line-strong transition-colors"
                >
                  <div className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <Clock3 className="w-4 h-4 text-ink-muted mt-1 shrink-0" aria-hidden="true" />

                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="font-medium text-ink text-sm truncate">
                            {t.original_filename ?? `Task ${t.task_id.slice(0, 8)}…`}
                          </p>
                          <StatusBadge status={t.status} />
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-ink-faint">
                          <span>{new Date(t.created_at).toLocaleString()}</span>
                          {t.processing_ms ? (
                            <span>{(t.processing_ms / 1000).toFixed(1)}s</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
                      {canCancel && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleCancel(t.task_id)
                          }}
                          disabled={isWorking}
                          className="inline-flex items-center gap-2 rounded px-3 py-2 text-xs font-medium text-ink border border-line-strong hover:bg-paper disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
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
                            'inline-flex items-center gap-2 rounded px-3 py-2 text-xs font-medium border disabled:opacity-50 transition-colors',
                            pendingDelete === t.task_id
                              ? 'text-paper bg-ink border-ink'
                              : 'text-ink border-line-strong hover:bg-paper'
                          )}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {pendingDelete === t.task_id ? 'Confirm?' : 'Delete'}
                        </button>
                      )}

                      <ChevronRight className="w-4 h-4 text-ink-faint group-hover:text-ink transition-colors shrink-0" />
                    </div>
                  </div>
                </Link>
              )
            })}

            {filteredTasks.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-ink font-medium">No matching analysis found</p>
                <p className="text-sm text-ink-muted mt-2">
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
