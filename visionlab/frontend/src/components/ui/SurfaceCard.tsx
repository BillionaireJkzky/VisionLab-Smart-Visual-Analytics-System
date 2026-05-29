import type { ReactNode } from 'react'
import clsx from 'clsx'

interface SurfaceCardProps {
  children: ReactNode
  className?: string
  padded?: boolean
  as?: 'section' | 'article' | 'div'
}

export function SurfaceCard({
  children,
  className = '',
  padded = true,
  as: Tag = 'section',
}: SurfaceCardProps) {
  return (
    <Tag
      className={clsx(
        'border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-2xl',
        className,
      )}
      style={{ borderRadius: 'var(--theme-radius, 28px)' }}
    >
      {padded ? <div className="p-5 md:p-6">{children}</div> : children}
    </Tag>
  )
}
