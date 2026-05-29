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
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi, getApiErrorMessage } from '../services/api'
import type { AdminAnalyticsResponse } from '../types/api'
import { SurfaceCard } from '../components/ui'
import clsx from 'clsx'

function StatCard({
  label,
  value,
  icon: Icon,
  accentClass,
}: {
  label: string
  value: string | number
  icon: ComponentType<{ className?: string }>
  accentClass: string
}) {
  return (
    <SurfaceCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className={clsx('mt-3 text-4xl font-bold tracking-tight', accentClass)}>{value}</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <Icon className={clsx('w-5 h-5', accentClass)} />
        </div>
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
          <div className="w-16 h-16 rounded-3xl border border-white/10 bg-white/[0.04] flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-cyan-300 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium">Loading admin analytics</p>
            <p className="text-sm text-slate-400 mt-1">Please wait a moment...</p>
          </div>
        </div>
      </div>
    )
  }

  if (errorMessage || !analytics) {
    return (
      <div
        className="border border-rose-400/20 bg-rose-500/10 text-center"
        style={{ borderRadius: 'var(--theme-radius)' }}
      >
        <div className="py-16 px-6">
          <XCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-white font-medium">{errorMessage ?? 'Failed to load analytics.'}</p>
        </div>
      </div>
    )
  }

  const avgProcessing = analytics.avg_processing_ms
    ? `${(analytics.avg_processing_ms / 1000).toFixed(1)}s`
    : '—'

  const maxCount = analytics.top_detected_objects[0]?.count ?? 1

  return (
    <div className="max-w-5xl mx-auto animate-fade-in space-y-8">
      <section
        className="relative overflow-hidden border border-white/10 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-fuchsia-500/10 shadow-2xl"
        style={{ borderRadius: 'var(--theme-radius)' }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-14 right-0 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-72 h-72 rounded-full bg-fuchsia-500/10 blur-3xl" />
        </div>
        <div className="relative z-10 p-6 md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Admin
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-cyan-300" aria-hidden="true" />
            <h1 className="text-3xl md:text-4xl font-bold text-white">System Analytics</h1>
          </div>
          <p className="mt-3 text-slate-300 leading-7">
            Platform-wide usage statistics across all users and analyses.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-5">
        <StatCard label="Total Users"     value={analytics.total_users}     icon={Users}        accentClass="text-cyan-300" />
        <StatCard label="Total Analyses"  value={analytics.total_tasks}     icon={TrendingUp}   accentClass="text-blue-300" />
        <StatCard label="Completed"       value={analytics.completed_tasks} icon={CheckCircle2} accentClass="text-emerald-300" />
        <StatCard label="Failed"          value={analytics.failed_tasks}    icon={XCircle}      accentClass="text-rose-300" />
        <StatCard label="Avg Processing"  value={avgProcessing}             icon={Clock3}       accentClass="text-amber-300" />
        <StatCard label="Last 24 Hours"   value={analytics.tasks_last_24h}  icon={Activity}     accentClass="text-fuchsia-300" />
      </section>

      {analytics.top_detected_objects.length > 0 && (
        <SurfaceCard padded={false} as="section">
          <div className="p-5 md:p-6 border-b border-white/10">
            <h2 className="text-xl font-bold text-white">Top Detected Objects</h2>
            <p className="text-sm text-slate-400 mt-1">Most frequently detected labels across completed analyses.</p>
          </div>
          <div className="p-5 md:p-6 space-y-4">
            {analytics.top_detected_objects.map(({ label, count }, i) => {
              const pct = Math.round((count / maxCount) * 100)
              return (
                <div key={label} className="flex items-center gap-4">
                  <span className="w-5 text-xs text-slate-500 text-right shrink-0">{i + 1}</span>
                  <span className="w-28 text-sm font-medium text-white capitalize shrink-0">{label}</span>
                  <div className="flex-1 bg-white/[0.06] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-400 to-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${label}: ${count} detections`}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-8 text-right shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        </SurfaceCard>
      )}
    </div>
  )
}
