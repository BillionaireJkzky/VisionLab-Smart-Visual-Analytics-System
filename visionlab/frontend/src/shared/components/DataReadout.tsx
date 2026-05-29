import { twMerge } from 'tailwind-merge'

const glowMap = {
  none:    '',
  cyan:    'drop-shadow-[0_0_8px_rgba(6,182,212,0.7)]',
  indigo:  'drop-shadow-[0_0_8px_rgba(99,102,241,0.7)]',
  violet:  'drop-shadow-[0_0_8px_rgba(168,85,247,0.7)]',
  emerald: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]',
  amber:   'drop-shadow-[0_0_8px_rgba(245,158,11,0.7)]',
} as const

const colorMap = {
  none:    'text-slate-100',
  cyan:    'text-cyan-300',
  indigo:  'text-indigo-300',
  violet:  'text-violet-300',
  emerald: 'text-emerald-300',
  amber:   'text-amber-300',
} as const

type GlowColor = keyof typeof glowMap

interface DataReadoutProps {
  value:      string | number
  label?:     string
  unit?:      string
  glow?:      GlowColor
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

export function DataReadout({
  value,
  label,
  unit,
  glow = 'none',
  size = 'md',
  className,
  mono = true,
}: DataReadoutProps) {
  const sz = sizeMap[size]

  return (
    <div className={twMerge('flex flex-col gap-0.5', className)}>
      {label && (
        <span className={`${sz.label} text-slate-500 uppercase tracking-widest font-medium`}>
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-1">
        <span
          className={twMerge(
            sz.value,
            'font-bold tabular-nums leading-none',
            mono && 'font-mono',
            colorMap[glow],
            glowMap[glow],
          )}
        >
          {value}
        </span>
        {unit && (
          <span className={`${sz.unit} text-slate-500 font-medium`}>{unit}</span>
        )}
      </div>
    </div>
  )
}
