import type { ReactNode } from 'react'
import clsx from 'clsx'
import { useSettings } from '../../hooks/useSettings'

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
  const { committed } = useSettings()
  const isCompact = committed.density === 'compact'
  const isShadowSeparation = committed.separation === 'shadow'

  return (
    <Tag
      className={clsx(
        'rounded-lg border shadow-card',
        isShadowSeparation ? 'border-transparent shadow-raised' : 'border-line',
        'bg-paper-raised',
        className,
      )}
    >
      {padded ? <div className={isCompact ? 'p-4' : 'p-5 md:p-6'}>{children}</div> : children}
    </Tag>
  )
}
