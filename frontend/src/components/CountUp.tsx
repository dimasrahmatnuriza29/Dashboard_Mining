import { useEffect, useState } from 'react'

const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

interface Props {
  value: number
  decimals?: number
  duration?: number
}

/** Ease-out numeric count-up, same feel as the mockup. */
export default function CountUp({ value, decimals = 0, duration = 1300 }: Props) {
  const [v, setV] = useState(0)

  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setV(value * e)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <span>{fmt(v, decimals)}</span>
}
