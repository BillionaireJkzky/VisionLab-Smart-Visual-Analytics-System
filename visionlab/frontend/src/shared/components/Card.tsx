import { cva, type VariantProps } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { type ReactNode, type CSSProperties } from 'react'
import { useSettings } from '../../hooks/useSettings'

// Compact density shifts each padding step down one notch on the existing
// scale (no new arbitrary values). Comfortable (default) is unaffected.
const COMPACT_PADDING: Record<string, string> = {
  none: '',
  sm:   'p-3',
  md:   'p-4',
  lg:   'p-6',
  xl:   'p-8',
}

const cardBase = cva(
  'rounded-lg border transition-colors duration-150',
  {
    variants: {
      variant: {
        default:  ['bg-paper-raised border-line shadow-card'],
        elevated: ['bg-paper-raised border-line-strong shadow-raised'],
      },
      padding: {
        none: '',
        sm:   'p-4',
        md:   'p-6',
        lg:   'p-8',
        xl:   'p-10',
      },
      hover: {
        true:  'hover:border-ink-faint cursor-pointer select-none',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      hover:   false,
    },
  },
)

type CardVariants = VariantProps<typeof cardBase>

interface CardProps extends CardVariants {
  children:      ReactNode
  className?:    string
  style?:        CSSProperties
  onClick?:      () => void
  as?:           'div' | 'section' | 'article'
  'aria-label'?: string
}

export function Card({
  children,
  className,
  variant,
  padding,
  hover,
  style,
  onClick,
  as: Tag = 'div',
  'aria-label': ariaLabel,
}: CardProps) {
  const { committed } = useSettings()
  const compactOverride = committed.density === 'compact' ? COMPACT_PADDING[padding ?? 'md'] : ''
  const shadowSeparationOverride = committed.separation === 'shadow' ? 'border-transparent shadow-raised' : ''

  return (
    <Tag
      className={twMerge(cardBase({ variant, padding, hover }), compactOverride, shadowSeparationOverride, className)}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </Tag>
  )
}
