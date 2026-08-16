import { cva, type VariantProps } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { type ReactNode } from 'react'

const badgeBase = cva(
  'inline-flex items-center gap-1.5 font-mono font-medium rounded transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-paper-raised border border-line-strong text-ink-muted',
        success: 'bg-positive-subtle border border-positive text-positive',
        warning: 'bg-caution-subtle border border-caution text-caution',
        danger:  'bg-negative-subtle border border-negative text-negative',
        info:    'bg-accent-subtle border border-accent text-accent',
      },
      size: {
        sm: 'px-1.5  py-0.5 text-[10px]',
        md: 'px-2    py-0.5 text-xs',
        lg: 'px-2.5  py-1   text-sm',
      },
      dot: {
        true:  '',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size:    'md',
      dot:     false,
    },
  },
)

const dotColor: Record<string, string> = {
  default: 'bg-ink-faint',
  success: 'bg-positive',
  warning: 'bg-caution',
  danger:  'bg-negative',
  info:    'bg-accent',
}

type BadgeVariants = VariantProps<typeof badgeBase>

interface BadgeProps extends BadgeVariants {
  children:   ReactNode
  className?: string
}

export function Badge({ children, className, variant = 'default', size, dot }: BadgeProps) {
  return (
    <span className={twMerge(badgeBase({ variant, size, dot }), className)}>
      {dot && (
        <span
          className={`rounded-full ${dotColor[variant ?? 'default'] ?? 'bg-ink-faint'} ${size === 'lg' ? 'h-2 w-2' : 'h-1.5 w-1.5'}`}
        />
      )}
      {children}
    </span>
  )
}
