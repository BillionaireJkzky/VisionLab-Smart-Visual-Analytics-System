import { cva, type VariantProps } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'
import { type ReactNode, type CSSProperties } from 'react'

const cardBase = cva(
  'rounded-2xl border transition-all duration-300',
  {
    variants: {
      variant: {
        default:  [
          'bg-white/[0.03] border-white/[0.07]',
          'shadow-[0_20px_50px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]',
        ],
        elevated: [
          'bg-white/[0.06] border-white/[0.12]',
          'shadow-[0_24px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]',
        ],
        glass: [
          'backdrop-blur-xl bg-white/[0.04] border-white/[0.08]',
          'shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.2)]',
        ],
        gradient: 'border-transparent bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-cyan-500/10',
        glow: [
          'bg-white/[0.04] backdrop-blur-xl',
          'border-indigo-500/20',
          'shadow-[0_0_40px_rgba(99,102,241,0.15),0_20px_50px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]',
        ],
      },
      padding: {
        none: '',
        sm:   'p-4',
        md:   'p-6',
        lg:   'p-8',
        xl:   'p-10',
      },
      hover: {
        true:  'hover:-translate-y-1 hover:border-white/[0.14] cursor-pointer select-none',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'glass',
      padding: 'md',
      hover:   false,
    },
  },
)

type CardVariants = VariantProps<typeof cardBase>

interface CardProps extends CardVariants {
  children:      ReactNode
  className?:    string
  gradientEdge?: string
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
  gradientEdge,
  style,
  onClick,
  as: Tag = 'div',
  'aria-label': ariaLabel,
}: CardProps) {
  const inner = (
    <Tag
      className={twMerge(cardBase({ variant, padding, hover }), className)}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </Tag>
  )

  if (gradientEdge) {
    return (
      <div className="rounded-2xl p-px" style={{ background: gradientEdge }}>
        <Tag
          className={twMerge(cardBase({ variant: 'default', padding, hover }), 'rounded-[15px]', className)}
          style={style}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          {children}
        </Tag>
      </div>
    )
  }

  return inner
}
