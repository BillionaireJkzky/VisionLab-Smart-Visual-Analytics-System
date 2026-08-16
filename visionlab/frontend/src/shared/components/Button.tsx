import { cva, type VariantProps } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { type ReactNode, type ButtonHTMLAttributes } from 'react'

const buttonBase = cva(
  [
    'inline-flex items-center justify-center gap-2 font-medium rounded',
    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
    'disabled:opacity-40 disabled:pointer-events-none select-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-accent text-paper',
          'hover:bg-accent-hover',
        ],
        secondary: [
          'bg-paper-raised border border-line-strong text-ink',
          'hover:bg-paper hover:border-ink-faint',
        ],
        ghost: [
          'text-ink-muted hover:text-ink hover:bg-paper',
        ],
        danger: [
          'bg-negative-subtle border border-negative text-negative',
          'hover:bg-negative hover:text-paper',
        ],
      },
      size: {
        sm:   'h-8  px-3   text-xs  rounded',
        md:   'h-10 px-4   text-sm',
        lg:   'h-12 px-6   text-base',
        icon: 'h-9  w-9    text-sm  rounded p-0',
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
