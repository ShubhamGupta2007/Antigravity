// Decorative artwork for the invitation: mandalas, falling marigold petals and a toran.
// Purely visual (aria-hidden) and animated with invite.css.

const ROTATIONS = Array.from({ length: 15 }, (_, i) => i * 24)

export function Mandala({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" className={className} style={style}>
      <g fill="none" stroke="#F2C46D" strokeWidth="0.5">
        <circle cx="100" cy="100" r="98" />
        <circle cx="100" cy="100" r="84" />
        <circle cx="100" cy="100" r="50" />
        <circle cx="100" cy="100" r="18" />
        {ROTATIONS.map(r => (
          <ellipse key={r} cx="100" cy="36" rx="10" ry="30" transform={`rotate(${r} 100 100)`} />
        ))}
      </g>
    </svg>
  )
}

export function MandalaStar({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" className={className} style={style}>
      <g fill="none" stroke="#F2C46D" strokeWidth="0.8">
        <circle cx="100" cy="100" r="90" />
        <circle cx="100" cy="100" r="62" />
        <path d="M100 10 L112 38 L100 62 L88 38 Z M190 100 L162 112 L138 100 L162 88 Z M100 190 L88 162 L100 138 L112 162 Z M10 100 L38 88 L62 100 L38 112 Z" />
        <path d="M164 36 L146 66 L134 66 L134 54 Z M164 164 L134 146 L134 134 L146 134 Z M36 164 L54 134 L66 134 L66 146 Z M36 36 L66 54 L66 66 L54 66 Z" />
      </g>
    </svg>
  )
}

const PETALS = [
  { left: '6%', color: '#F59E0B', dur: 12, delay: -2 },
  { left: '18%', color: '#E2771C', dur: 15, delay: -7 },
  { left: '31%', color: '#F7B733', dur: 13, delay: -4 },
  { left: '44%', color: '#E25822', dur: 17, delay: -10 },
  { left: '57%', color: '#F59E0B', dur: 14, delay: -5 },
  { left: '69%', color: '#F7B733', dur: 16, delay: -12 },
  { left: '81%', color: '#E2771C', dur: 13, delay: -8 },
  { left: '92%', color: '#E25822', dur: 18, delay: -3 },
  { left: '25%', color: '#FFFFFF', dur: 19, delay: -13, opacity: 0.7 },
  { left: '75%', color: '#FFFFFF', dur: 18, delay: -6, opacity: 0.7 }
]

export function Petals() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="inv-petal"
          style={{ left: p.left, background: p.color, opacity: p.opacity, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}
        />
      ))}
    </div>
  )
}

export function Toran() {
  const flowers = [30, 80, 130, 195, 260, 310, 360]
  const flowerY = [16, 25, 31, 34, 31, 25, 16]
  const leaves = [55, 105, 160, 224, 280, 332]
  const leafY = [21, 28, 33, 33, 28, 21]
  return (
    <svg aria-hidden="true" viewBox="0 0 390 70" preserveAspectRatio="none" className="inv-toran absolute left-0 top-0 h-[70px] w-full">
      <path d="M0 6 Q195 40 390 6" fill="none" stroke="#5B7C4F" strokeWidth="3" />
      <g fill="#F59E0B">
        {flowers.map((x, i) => <circle key={x} cx={x} cy={flowerY[i]} r={i === 3 ? 8 : 7} />)}
      </g>
      <g fill="#5B7C4F">
        {leaves.map((x, i) => <path key={x} d={`M${x} ${leafY[i]} l6 16 l6 -14 z`} />)}
      </g>
    </svg>
  )
}

export function CameraIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M8 6l1.5-2h5L16 6" />
    </svg>
  )
}
