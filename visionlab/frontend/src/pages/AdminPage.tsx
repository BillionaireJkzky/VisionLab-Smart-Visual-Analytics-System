import { useEffect, useState, type ComponentType } from 'react'
import {
  ShieldCheck,
  Loader2,
  Users,
  CheckCircle2,
  XCircle,
  Clock3,
  TrendingUp,
  Activity,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, getApiErrorMessage } from '../services/api'
import type { AdminAnalyticsResponse } from '../types/api'
import { SurfaceCard } from '../components/ui'

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <SurfaceCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-faint">{label}</p>
          <p className="mt-3 text-3xl font-mono font-semibold tracking-tight text-ink">{value}</p>
        </div>
        <Icon className="w-4 h-4 text-ink-muted shrink-0 mt-1" aria-hidden="true" />
      </div>
    </SurfaceCard>
  )
}

export default function AdminPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadAnalytics = async () => {
      try {
        const res = await adminApi.getAnalytics()
        if (cancelled) return
        setAnalytics(res.data)
      } catch (error: unknown) {
        if (cancelled) return
        const message = getApiErrorMessage(error, 'Failed to load analytics.')
        setErrorMessage(message)
        toast.error(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadAnalytics()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-4" role="status" aria-live="polite" aria-busy="true">
          <Loader2 className="w-6 h-6 text-ink-muted animate-spin" />
          <div className="text-center">
            <p className="text-ink font-medium">Loading admin analytics</p>
            <p className="text-sm text-ink-muted mt-1">Please wait a moment...</p>
          </div>
        </div>
      </div>
    )
  }

  if (errorMessage || !analytics) {
    return (
      <div className="border border-line-strong rounded-lg bg-negative-subtle text-center">
        <div className="py-16 px-6">
          <XCircle className="w-8 h-8 text-negative mx-auto mb-3" />
          <p className="text-ink font-medium">{errorMessage ?? 'Failed to load analytics.'}</p>
        </div>
      </div>
    )
  }

  const avgProcessing = analytics.avg_processing_ms
    ? `${(analytics.avg_processing_ms / 1000).toFixed(1)}s`
    : '—'

  const maxCount = analytics.top_detected_objects[0]?.count ?? 1

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-10">
      <header className="pb-8 border-b border-line">
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mb-4">
          Admin
        </p>
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-ink" aria-hidden="true" />
          <h1 className="font-display text-3xl md:text-4xl font-medium text-ink">System analytics</h1>
        </div>
        <p className="mt-3 text-ink-muted leading-7">
          Platform-wide usage statistics across all users and analyses.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Total users"     value={analytics.total_users}     icon={Users} />
        <StatCard label="Total analyses"  value={analytics.total_tasks}     icon={TrendingUp} />
        <StatCard label="Completed"       value={analytics.completed_tasks} icon={CheckCircle2} />
        <StatCard label="Failed"          value={analytics.failed_tasks}    icon={XCircle} />
        <StatCard label="Avg processing"  value={avgProcessing}             icon={Clock3} />
        <StatCard label="Last 24 hours"   value={analytics.tasks_last_24h}  icon={Activity} />
      </section>

      {analytics.top_detected_objects.length > 0 && (
        <SurfaceCard padded={false} as="section">
          <div className="p-5 md:p-6 border-b border-line">
            <h2 className="text-lg font-semibold text-ink">Top detected objects</h2>
            <p className="text-sm text-ink-muted mt-1">Most frequently detected labels across completed analyses.</p>
          </div>
          <div className="p-5 md:p-6 space-y-4">
            {analytics.top_detected_objects.map(({ label, count }, i) => {
              const pct = Math.round((count / maxCount) * 100)
              return (
                <div key={label} className="flex items-center gap-4">
                  <span className="w-5 text-xs font-mono text-ink-faint text-right shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="w-28 text-sm font-medium text-ink capitalize shrink-0">{label}</span>
                  <div className="flex-1 bg-line rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-ink h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${label}: ${count} detections`}
                    />
                  </div>
                  <span className="text-xs font-mono text-ink-faint w-8 text-right shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        </SurfaceCard>
      )}
    </div>
  )
}
