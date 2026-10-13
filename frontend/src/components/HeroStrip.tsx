const DUST = [
  { left: '58%', top: '70%', delay: '0s' },
  { left: '63%', top: '78%', delay: '1.4s' },
  { left: '70%', top: '72%', delay: '2.8s' },
  { left: '80%', top: '76%', delay: '.7s' },
]

export default function HeroStrip() {
  return (
    <section className="rise d1 relative mt-5 overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-r from-white via-mine-50/60 to-copper-50/50 px-7 py-5 shadow-sm">
      {DUST.map((d, i) => (
        <div key={i} className="dust" style={{ left: d.left, top: d.top, animationDelay: d.delay }} />
      ))}

      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-copper-600">Mining Operations</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Executive Analytics Dashboard</h1>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
            Production, recovery, equipment &amp; forecast insights — streamed read-only from Snowflake. Click any chart to drill down.
          </p>
        </div>

        {/* animated excavator */}
        <div className="relative hidden shrink-0 md:block" style={{ width: 230, height: 110 }}>
          <svg viewBox="0 0 230 110" className="h-full w-full">
            <path d="M0 92 Q60 84 115 92 T230 92" stroke="#CBD5E1" strokeWidth="1.4" fill="none" />
            <path d="M0 100 Q70 92 140 100 T230 100" stroke="#E2E8F0" strokeWidth="1.2" fill="none" />
            <path d="M172 92 L196 62 L220 92 Z" fill="#FCC855" opacity=".85" />
            <path d="M182 92 L199 70 L216 92 Z" fill="#FBAD24" opacity=".8" />
            <g className="exca-body">
              <rect x="18" y="78" width="66" height="14" rx="7" fill="#475569" />
              <circle cx="30" cy="85" r="3.4" fill="#94A3B8" /><circle cx="44" cy="85" r="3.4" fill="#94A3B8" /><circle cx="58" cy="85" r="3.4" fill="#94A3B8" /><circle cx="72" cy="85" r="3.4" fill="#94A3B8" />
              <rect x="24" y="52" width="50" height="26" rx="5" fill="#F58A0B" />
              <rect x="30" y="57" width="16" height="13" rx="2.5" fill="#BAE6FD" />
              <rect x="52" y="57" width="16" height="10" rx="2" fill="#D96406" />
              <g className="exca-arm">
                <path d="M36 30 L96 14 L118 8" stroke="#B44409" strokeWidth="9" strokeLinecap="round" fill="none" />
                <g className="exca-bucket">
                  <path d="M118 8 L138 30" stroke="#92350E" strokeWidth="7" strokeLinecap="round" />
                  <path d="M132 26 l14 8 -6 10 -13 -6 z" fill="#475569" />
                </g>
              </g>
            </g>
          </svg>
        </div>
      </div>
    </section>
  )
}
