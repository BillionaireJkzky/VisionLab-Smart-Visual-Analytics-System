import { twMerge } from 'tailwind-merge'

const colorMap = {
  none:     'text-ink',
  accent:   'text-accent',
  positive: 'text-positive',
  caution:  'text-caution',
  negative: 'text-negative',
} as const

type ReadoutColor = keyof typeof colorMap

interface DataReadoutProps {
  value:      string | number
  label?:     string
  unit?:      string
  color?:     ReadoutColor
  size?:      'sm' | 'md' | 'lg' | 'xl'
  className?: string
  mono?:      boolean
}

const sizeMap = {
  sm: { value: 'text-lg',  label: 'text-[10px]', unit: 'text-xs'  },
  md: { value: 'text-2xl', label: 'text-xs',     unit: 'text-sm'  },
  lg: { value: 'text-4xl', label: 'text-sm',     unit: 'text-base'},
  xl: { value: 'text-6xl', label: 'text-base',   unit: 'text-lg'  },
}

// Every confidence %, timing, model name, and ID in the product renders
// through this component (or matches its mono treatment) — a deliberate
// technical signature, not decoration.
export function DataReadout({
  value,
  label,
  unit,
  color = 'none',
  size = 'md',
  className,
  mono = true,
}: DataReadoutProps) {
  const sz = sizeMap[size]

  return (
    <div className={twMerge('flex flex-col gap-0.5', className)}>
      {label && (
        <span className={`${sz.label} text-ink-faint uppercase tracking-wide font-medium`}>
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-1">
        <span
          className={twMerge(
            sz.value,
            'font-semibold tabular-nums leading-none',
            mono && 'font-mono',
            colorMap[color],
          )}
        >
          {value}
        </span>
        {unit && (
          <span className={`${sz.unit} text-ink-muted font-medium`}>{unit}</span>
        )}
      </div>
    </div>
  )
}
