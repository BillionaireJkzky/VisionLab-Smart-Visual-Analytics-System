import type { ComponentType, ReactNode, AriaAttributes } from 'react'

interface SectionTitleProps {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: AriaAttributes['aria-hidden'] }>
  title: string
  right?: ReactNode
}

export function SectionTitle({ icon: Icon, title, right }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <Icon className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {right ? <div className="ml-auto">{right}</div> : null}
    </div>
  )
}
