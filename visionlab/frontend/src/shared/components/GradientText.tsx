import { twMerge } from 'tailwind-merge'
import { type ReactNode, type ElementType } from 'react'

const presets = {
  cosmic:  'from-indigo-400 via-violet-400 to-cyan-400',
  aurora:  'from-emerald-400 via-cyan-400 to-indigo-400',
  sunset:  'from-amber-400 via-red-400 to-violet-400',
  neon:    'from-cyan-300 via-indigo-400 to-pink-400',
  gold:    'from-amber-300 via-yellow-300 to-orange-400',
  plasma:  'from-violet-400 via-fuchsia-400 to-pink-400',
} as const

type Preset = keyof typeof presets

interface GradientTextProps {
  children:   ReactNode
  preset?:    Preset
  from?:      string
  via?:       string
  to?:        string
  className?: string
  as?:        ElementType
  animate?:   boolean
}

export function GradientText({
  children,
  preset = 'cosmic',
  from,
  via,
  to,
  className,
  as: Tag = 'span',
  animate = false,
}: GradientTextProps) {
  const gradientClasses = from
    ? [from, via ?? '', to ?? ''].filter(Boolean).join(' ')
    : presets[preset]

  return (
    <Tag
      className={twMerge(
        'bg-gradient-to-r bg-clip-text text-transparent',
        gradientClasses,
        animate && 'animate-shimmer bg-[length:200%_auto]',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
