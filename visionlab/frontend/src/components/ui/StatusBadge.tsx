import clsx from 'clsx'
import type { TaskStatus, TaskStepStatus } from '../../types/api'

const TASK_STATUS_STYLES: Record<string, string> = {
  pending:    'bg-caution-subtle text-caution border-caution',
  processing: 'bg-accent-subtle text-accent border-accent',
  completed:  'bg-positive-subtle text-positive border-positive',
  failed:     'bg-negative-subtle text-negative border-negative',
}

const STEP_STATUS_STYLES: Record<string, string> = {
  waiting: 'bg-paper text-ink-muted border-line-strong',
  running: 'bg-accent-subtle text-accent border-accent',
  done:    'bg-positive-subtle text-positive border-positive',
  skipped: 'bg-caution-subtle text-caution border-caution',
  failed:  'bg-negative-subtle text-negative border-negative',
}

const FALLBACK = 'bg-paper text-ink-muted border-line-strong'

export function StatusBadge({ status }: { status: TaskStatus | string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded border px-2.5 py-1 text-xs font-mono font-medium lowercase',
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
        'inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-mono font-medium lowercase',
        STEP_STATUS_STYLES[status] ?? FALLBACK,
      )}
    >
      {status}
    </span>
  )
}
