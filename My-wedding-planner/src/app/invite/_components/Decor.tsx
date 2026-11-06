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

/** Shri Ganesh in fine gold line art inside a halo (opening of the invitation). */
export function GaneshJi({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg role="img" aria-label="Shri Ganesh" viewBox="0 0 100 110" className={className} style={style} fill="none" stroke="#F2C46D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="50" cy="52" r="46" strokeWidth="0.7" strokeDasharray="1 3" opacity="0.7" />
      <circle cx="50" cy="52" r="40" strokeWidth="0.5" opacity="0.4" />
      <circle cx="50" cy="9" r="2.4" fill="#F2C46D" stroke="none" />
      <path d="M50 12 C45 17 40 24 39 31 H61 C60 24 55 17 50 12 Z" />
      <path d="M44 24 H56 M41.5 28 H58.5" />
      <circle cx="50" cy="20" r="1.6" fill="#E25822" stroke="none" />
      <path d="M37 31 H63 Q64 33 62 34 H38 Q36 33 37 31 Z" fill="#F2C46D" fillOpacity="0.35" />
      <path d="M38 36 C26 30 15 36 16 49 C17 60 26 66 35 61 C38 59 39 56 39 53" />
      <path d="M62 36 C74 30 85 36 84 49 C83 60 74 66 65 61 C62 59 61 56 61 53" />
      <path d="M33 41 C26 40 22 45 23 51 M67 41 C74 40 78 45 77 51" strokeWidth="0.9" opacity="0.7" />
      <path d="M38 34 C37 44 40 52 45 56 M62 34 C63 44 60 52 55 56" />
      <path d="M50 35 V41" stroke="#E25822" strokeWidth="1.8" />
      <path d="M47 36 Q50 40 53 36" strokeWidth="1" />
      <path d="M41 44 Q44 41.5 47 44 Q44 45.5 41 44 Z M53 44 Q56 41.5 59 44 Q56 45.5 53 44 Z" fill="#F2C46D" fillOpacity="0.5" />
      <path d="M45 56 C45 66 43 74 47 82 C51 89 61 88 62 81 C62.5 77 58 75.5 56 78 C55 80 57 82 58.5 81" />
      <path d="M55 56 C55 64 54 71 55 76" />
      <path d="M46 62 Q50 63.5 54.5 62 M45.5 68 Q50 69.5 54.5 68 M46.5 74 Q50 75 54.8 74" strokeWidth="0.8" opacity="0.8" />
      <path d="M58 56 Q62 60 61 65" strokeWidth="1.3" />
      <path d="M30 96 Q50 104 70 96" strokeWidth="1.1" />
      <circle cx="50" cy="101" r="1.8" fill="#F2C46D" stroke="none" />
    </svg>
  )
}

const STARS = [
  [8, 7], [24, 15], [38, 5], [62, 11], [85, 20], [15, 30], [92, 36], [53, 25], [72, 42], [5, 48], [45, 44], [30, 55]
]
const LANTERNS = [
  { left: '10%', dur: 16, delay: -3, scale: 1 },
  { left: '30%', dur: 19, delay: -11, scale: 0.8 },
  { left: '64%', dur: 15, delay: -7, scale: 1 },
  { left: '82%', dur: 21, delay: -15, scale: 0.9 },
  { left: '48%', dur: 18, delay: -1, scale: 0.75 }
]

/** Night sky: full moon, twinkling stars and glowing sky lanterns rising. */
export function NightSky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {STARS.map(([x, y], i) => (
        <span key={i} className="inv-star" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${-(i % 5) * 0.6}s` }} />
      ))}
      <span className="absolute right-[10%] top-[6%] h-14 w-14 rounded-full bg-[#F6E7C1] shadow-[0_0_40px_14px_rgba(246,231,193,0.25)]" />
      {LANTERNS.map((l, i) => (
        <span key={i} className="inv-lantern" style={{ left: l.left, animationDuration: `${l.dur}s`, animationDelay: `${l.delay}s`, scale: String(l.scale) }} />
      ))}
    </div>
  )
}

const LOTUSES = [
  { left: '8%', bottom: '30%', size: 40, delay: 0 },
  { left: '44%', bottom: '14%', size: 40, delay: -1.2 },
  { left: '78%', bottom: '28%', size: 40, delay: -2.1 },
  { left: '25%', bottom: '6%', size: 28, delay: -0.6 },
  { left: '64%', bottom: '4%', size: 28, delay: -1.7 }
]

function Lotus({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 40 28" width={size} height={Math.round(size * 0.7)}>
      <ellipse cx="20" cy="23" rx="19" ry="4.5" fill="#2F5E3A" />
      <path d="M20 21 C12 22 5 20 2 16 C9 15 16 17 20 21 Z" fill="#D86A8A" />
      <path d="M20 21 C28 22 35 20 38 16 C31 15 24 17 20 21 Z" fill="#D86A8A" />
      <path d="M20 21 C13 19 8 14 7 9 C13 10 18 14 20 21 Z" fill="#E8839E" />
      <path d="M20 21 C27 19 32 14 33 9 C27 10 22 14 20 21 Z" fill="#E8839E" />
      <path d="M20 4 C24 10 24 16 20 21 C16 16 16 10 20 4 Z" fill="#F4A3B8" />
      <circle cx="20" cy="17" r="1.6" fill="#F2C46D" />
    </svg>
  )
}

/** Palace silhouette on the water's edge, with lotuses floating on the pond. */
export function LotusPond() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[22vh] min-h-[140px]">
      <svg viewBox="0 0 390 80" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 top-0 h-[80px] w-full">
        <path fill="#4E1530" d="M0 80 V56 H24 V34 L30 26 L36 34 V56 H64 V44 Q92 18 120 44 V56 H140 V36 Q195 -2 250 36 V56 H270 V44 Q298 18 326 44 V56 H354 V34 L360 26 L366 34 V56 H390 V80 Z" />
        <path fill="#F2C46D" opacity="0.6" d="M88 50 h6 v6 h-6 z M296 50 h6 v6 h-6 z M27 44 h5 v6 h-5 z M358 44 h5 v6 h-5 z" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 top-[79px] bg-[#2A0716]">
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 390 120">
          <g stroke="#F2C46D" strokeWidth="1.2" opacity="0.25"><path d="M60 20 h60 M210 34 h90 M40 66 h50 M150 80 h80 M270 98 h70 M90 112 h60" /></g>
        </svg>
        {LOTUSES.map((l, i) => (
          <span key={i} className="inv-bob absolute" style={{ left: l.left, bottom: l.bottom, animationDelay: `${l.delay}s` }}>
            <Lotus size={l.size} />
          </span>
        ))}
      </div>
    </div>
  )
}
