import clsx from 'clsx'
import type { TaskStatus, TaskStepStatus } from '../../types/api'

const TASK_STATUS_STYLES: Record<string, string> = {
  pending:    'bg-amber-500/15  text-amber-300  border border-amber-400/20',
  processing: 'bg-cyan-500/15   text-cyan-300   border border-cyan-400/20',
  completed:  'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
  failed:     'bg-rose-500/15   text-rose-300   border border-rose-400/20',
}

const STEP_STATUS_STYLES: Record<string, string> = {
  waiting: 'bg-slate-500/15  text-slate-300  border border-white/10',
  running: 'bg-cyan-500/15   text-cyan-300   border border-cyan-400/20',
  done:    'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20',
  skipped: 'bg-amber-500/15  text-amber-300  border border-amber-400/20',
  failed:  'bg-rose-500/15   text-rose-300   border border-rose-400/20',
}

const FALLBACK = 'bg-slate-500/15 text-slate-300 border border-white/10'

export function StatusBadge({ status }: { status: TaskStatus | string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize',
        TASK_STATUS_STYLES[status] ?? FALLBACK,
      )}
    >
      {status}
    </span>
  )
}

export function StepStatusBadge({ status }: { status: TaskStepStatus | string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
        STEP_STATUS_STYLES[status] ?? FALLBACK,
      )}
    >
      {status}
    </span>
  )
}
