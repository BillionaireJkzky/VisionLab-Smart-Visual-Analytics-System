import { twMerge } from 'tailwind-merge'

interface SkeletonProps {
  className?: string
  rounded?:   'sm' | 'md' | 'lg' | 'full'
  width?:     string | number
  height?:    string | number
  lines?:     number
  gap?:       string
}

const roundedMap = {
  sm:   'rounded-sm',
  md:   'rounded',
  lg:   'rounded-lg',
  full: 'rounded-full',
}

export function Skeleton({
  className,
  rounded = 'md',
  width,
  height,
  lines,
  gap = 'gap-2',
}: SkeletonProps) {
  const base = twMerge(
    'bg-line animate-pulse',
    roundedMap[rounded],
    className,
  )

  if (lines && lines > 1) {
    return (
      <div className={`flex flex-col ${gap}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={twMerge(base, i === lines - 1 ? 'w-3/4' : 'w-full')}
            style={{ height: height ?? 16 }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={base}
      style={{
        width:  width  !== undefined ? width  : undefined,
        height: height !== undefined ? height : 16,
      }}
    />
  )
}
