import type { ComponentType, ReactNode, AriaAttributes } from 'react'

interface SectionTitleProps {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: AriaAttributes['aria-hidden'] }>
  title: string
  right?: ReactNode
}

export function SectionTitle({ icon: Icon, title, right }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-10 h-10 rounded-2xl border border-white/10 bg-white/[0.05] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-cyan-300" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {right ? <div className="ml-auto">{right}</div> : null}
    </div>
  )
}
