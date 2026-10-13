import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  legend?: ReactNode
  delay?: string
  className?: string
  padded?: boolean
  children: ReactNode
}

/** Shared card chrome for every dashboard widget. */
export default function Panel({ title, subtitle, legend, delay = '', className = '', padded = true, children }: Props) {
  return (
    <div className={`panel rise ${delay} rounded-2xl border border-slate-200/70 bg-white shadow-sm ${padded ? 'p-5' : ''} ${className}`}>
      {(title || legend) && (
        <div className={`flex items-center justify-between ${padded ? '' : 'px-5 pt-4'}`}>
          <div>
            <p className="text-sm font-bold text-slate-800">{title}</p>
            {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          {legend}
        </div>
      )}
      {children}
    </div>
  )
}
