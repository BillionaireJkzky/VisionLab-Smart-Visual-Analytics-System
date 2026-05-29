import { cva, type VariantProps } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { type ReactNode } from 'react'

const badgeBase = cva(
  'inline-flex items-center gap-1.5 font-medium rounded-full transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-white/[0.07] border border-white/[0.12] text-slate-300',
        success: 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-300',
        warning: 'bg-amber-500/10  border border-amber-500/25  text-amber-300',
        danger:  'bg-red-500/10    border border-red-500/25    text-red-300',
        info:    'bg-cyan-500/10   border border-cyan-500/25   text-cyan-300',
        cosmic:  'bg-indigo-500/10 border border-indigo-500/25 text-indigo-300',
        violet:  'bg-violet-500/10 border border-violet-500/25 text-violet-300',
      },
      size: {
        sm: 'px-2    py-0.5 text-[10px]',
        md: 'px-2.5  py-1   text-xs',
        lg: 'px-3    py-1   text-sm',
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
  default: 'bg-slate-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger:  'bg-red-400',
  info:    'bg-cyan-400',
  cosmic:  'bg-indigo-400',
  violet:  'bg-violet-400',
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
          className={`rounded-full ${dotColor[variant ?? 'default'] ?? 'bg-slate-400'} ${size === 'lg' ? 'h-2 w-2' : 'h-1.5 w-1.5'}`}
        />
      )}
      {children}
    </span>
  )
}
