import { twMerge } from 'tailwind-merge'

const colorMap = {
  cyan:    { orb: 'bg-cyan-500',    blur: 'bg-cyan-500/30'   },
  indigo:  { orb: 'bg-indigo-500',  blur: 'bg-indigo-500/30' },
  violet:  { orb: 'bg-violet-500',  blur: 'bg-violet-500/30' },
  emerald: { orb: 'bg-emerald-500', blur: 'bg-emerald-500/30'},
  amber:   { orb: 'bg-amber-400',   blur: 'bg-amber-400/30'  },
  pink:    { orb: 'bg-pink-500',    blur: 'bg-pink-500/30'   },
} as const

type OrbColor = keyof typeof colorMap

interface GlowOrbProps {
  color?:     OrbColor
  size?:      number
  className?: string
  pulse?:     boolean
  intensity?: 'low' | 'medium' | 'high'
}

export function GlowOrb({
  color = 'cyan',
  size = 320,
  className,
  pulse = true,
  intensity = 'medium',
}: GlowOrbProps) {
  const { blur } = colorMap[color]

  const opacityMap = {
    low:    'opacity-20',
    medium: 'opacity-35',
    high:   'opacity-55',
  }

  return (
    <div
      className={twMerge('pointer-events-none absolute rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <div
        className={twMerge(
          'absolute inset-0 rounded-full blur-3xl',
          blur,
          opacityMap[intensity],
          pulse && 'animate-breathe',
        )}
      />
    </div>
  )
}
