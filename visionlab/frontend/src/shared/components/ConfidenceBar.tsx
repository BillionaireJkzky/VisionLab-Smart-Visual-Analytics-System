import { twMerge } from 'tailwind-merge'

interface ConfidenceBarProps {
  value:       number
  label?:      string
  showValue?:  boolean
  height?:     number
  className?:  string
  animate?:    boolean
}

function getBarStyle(pct: number): { gradient: string; shadow: string } {
  if (pct >= 0.8) {
    return {
      gradient: 'from-emerald-400 to-cyan-400',
      shadow:   'shadow-[0_0_12px_rgba(16,185,129,0.6)]',
    }
  }
  if (pct >= 0.5) {
    return {
      gradient: 'from-cyan-400 to-indigo-400',
      shadow:   'shadow-[0_0_10px_rgba(6,182,212,0.4)]',
    }
  }
  if (pct >= 0.25) {
    return {
      gradient: 'from-amber-400 to-orange-400',
      shadow:   'shadow-[0_0_8px_rgba(245,158,11,0.35)]',
    }
  }
  return {
    gradient: 'from-red-500 to-rose-400',
    shadow:   '',
  }
}

export function ConfidenceBar({
  value,
  label,
  showValue = true,
  height = 6,
  className,
  animate = true,
}: ConfidenceBarProps) {
  const pct = Math.min(1, Math.max(0, value))
  const { gradient, shadow } = getBarStyle(pct)

  return (
    <div className={twMerge('flex flex-col gap-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-slate-400">{label}</span>}
          {showValue && (
            <span className="tabular-nums font-mono text-slate-300">
              {Math.round(pct * 100)}%
            </span>
          )}
        </div>
      )}
      <div
        className="relative w-full overflow-hidden rounded-full bg-white/[0.07]"
        style={{ height }}
      >
        <div
          className={twMerge(
            'h-full rounded-full bg-gradient-to-r',
            gradient,
            shadow,
            animate && 'transition-[width] duration-700 ease-out',
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  )
}
