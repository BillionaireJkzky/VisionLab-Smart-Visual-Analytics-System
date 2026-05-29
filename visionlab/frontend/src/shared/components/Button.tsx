import { cva, type VariantProps } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { type ReactNode, type ButtonHTMLAttributes } from 'react'

const buttonBase = cva(
  [
    'inline-flex items-center justify-center gap-2 font-medium rounded-xl',
    'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-indigo-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
    'disabled:opacity-40 disabled:pointer-events-none select-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-gradient-to-r from-indigo-500 to-violet-500 text-white',
          'shadow-[0_0_20px_rgba(99,102,241,0.35)]',
          'hover:from-indigo-400 hover:to-violet-400 hover:shadow-[0_0_28px_rgba(99,102,241,0.55)]',
          'active:scale-[0.97]',
        ],
        secondary: [
          'bg-white/[0.07] border border-white/[0.12] text-slate-200',
          'hover:bg-white/[0.12] hover:border-white/[0.2] hover:text-white',
          'active:scale-[0.97]',
        ],
        ghost: [
          'text-slate-400 hover:text-white hover:bg-white/[0.07]',
          'active:scale-[0.97]',
        ],
        danger: [
          'bg-red-500/10 border border-red-500/30 text-red-400',
          'hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300',
          'active:scale-[0.97]',
        ],
        glow: [
          'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300',
          'shadow-[0_0_16px_rgba(6,182,212,0.2)]',
          'hover:bg-cyan-500/20 hover:border-cyan-400/50 hover:shadow-[0_0_24px_rgba(6,182,212,0.4)]',
          'active:scale-[0.97]',
        ],
      },
      size: {
        sm:   'h-8  px-3   text-xs  rounded-lg',
        md:   'h-10 px-4   text-sm',
        lg:   'h-12 px-6   text-base',
        icon: 'h-9  w-9    text-sm  rounded-xl p-0',
      },
      loading: {
        true:  'cursor-wait',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size:    'md',
      loading: false,
    },
  },
)

type ButtonVariants = VariantProps<typeof buttonBase>

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>,
    ButtonVariants {
  children?: ReactNode
  className?: string
  leftIcon?:  ReactNode
  rightIcon?: ReactNode
}

export function Button({
  children,
  className,
  variant,
  size,
  loading,
  leftIcon,
  rightIcon,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading === true}
      className={twMerge(buttonBase({ variant, size, loading }), className)}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
}
