import { twMerge } from 'tailwind-merge'

interface ConfidenceBarProps {
  value:       number
  label?:      string
  showValue?:  boolean
  height?:     number
  className?:  string
  animate?:    boolean
}

function getBarColor(pct: number): string {
  if (pct >= 0.8) return 'bg-positive'
  if (pct >= 0.5) return 'bg-accent'
  if (pct >= 0.25) return 'bg-caution'
  return 'bg-negative'
}

export function ConfidenceBar({
  value,
  label,
  showValue = true,
  height = 4,
  className,
  animate = true,
}: ConfidenceBarProps) {
  const pct = Math.min(1, Math.max(0, value))
  const barColor = getBarColor(pct)

  return (
    <div className={twMerge('flex flex-col gap-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-ink-muted">{label}</span>}
          {showValue && (
            <span className="tabular-nums font-mono text-ink">
              {Math.round(pct * 100)}%
            </span>
          )}
        </div>
      )}
      <div
        className="relative w-full overflow-hidden rounded-full bg-line"
        style={{ height }}
      >
        <div
          className={twMerge(
            'h-full rounded-full',
            barColor,
            animate && 'transition-[width] duration-500 ease-out',
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  )
}
