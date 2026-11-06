'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type FireworksHandle = {
  /** A few big bursts at once (seal broken, Enter) */
  celebrate: (bursts?: number) => void
}

type Spark = { x: number; y: number; px: number; py: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
type Rocket = { x: number; y: number; vy: number; targetY: number; color: string }

const COLORS = ['#F2C46D', '#FFE6A8', '#F59E0B', '#F472B6', '#FB7185', '#FFF6E0', '#A3E635', '#FDBA74']

/**
 * Festive fireworks over the night sky: an occasional rocket rises and bursts high up, away
 * from the text, and `celebrate()` sets off a volley. Drawn on one canvas; does nothing when
 * the guest prefers reduced motion.
 */
const Fireworks = forwardRef<FireworksHandle, { ambient?: boolean; className?: string }>(function Fireworks({ ambient = true, className = '' }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sparks = useRef<Spark[]>([])
  const rockets = useRef<Rocket[]>([])
  const reduced = useRef(false)

  const burst = (x: number, y: number, color: string, count = 90, power = 1) => {
    const palette = [color, color, '#FFF6E0', COLORS[Math.floor(Math.random() * COLORS.length)]]
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.2
      const speed = (2 + Math.random() * 3) * power
      const max = 75 + Math.random() * 45
      sparks.current.push({ x, y, px: x, py: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: max, max, color: palette[i % palette.length], size: 2 + Math.random() * 1.8 })
    }
  }

  const launch = (w: number, h: number, big = false) => {
    const x = w * (0.12 + Math.random() * 0.76)
    // Burst in the top third (or a little lower for the finale), clear of the card and buttons
    const targetY = h * (big ? 0.12 + Math.random() * 0.3 : 0.08 + Math.random() * 0.22)
    rockets.current.push({ x, y: h + 10, vy: -(big ? 14 : 8) - Math.random() * 2.5, targetY, color: COLORS[Math.floor(Math.random() * COLORS.length)] })
  }

  useImperativeHandle(ref, () => ({
    celebrate: (bursts = 6) => {
      const c = canvasRef.current
      if (!c || reduced.current) return
      const w = c.clientWidth
      const h = c.clientHeight
      for (let i = 0; i < bursts; i++) window.setTimeout(() => launch(w, h, true), i * 110)
    }
  }))

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canvas = canvasRef.current
    if (!canvas || reduced.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let last = performance.now()
    let nextAmbient = last + 900
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const tick = (now: number) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const dt = Math.min(2, (now - last) / 16.7)
      last = now
      if (ambient && now > nextAmbient && !document.hidden) {
        launch(w, h)
        nextAmbient = now + 1100 + Math.random() * 1500
      }

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      // Rockets: a short glowing trail rising, then a burst
      rockets.current = rockets.current.filter(r => {
        r.y += r.vy * dt
        r.vy += 0.06 * dt
        ctx.strokeStyle = r.color
        ctx.shadowColor = r.color
        ctx.shadowBlur = 10
        ctx.globalAlpha = 0.95
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(r.x, r.y)
        ctx.lineTo(r.x, r.y + 14)
        ctx.stroke()
        if (r.y <= r.targetY || r.vy >= -1) {
          burst(r.x, r.y, r.color, 80 + Math.floor(Math.random() * 40), r.vy < -12 ? 1.25 : 1)
          return false
        }
        return true
      })

      // Sparks: fall gently and fade, drawn as short streaks
      sparks.current = sparks.current.filter(s => {
        s.px = s.x
        s.py = s.y
        s.vx *= 0.985
        s.vy = s.vy * 0.985 + 0.035 * dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.life -= dt
        const t = Math.max(0, s.life / s.max)
        ctx.globalAlpha = Math.min(1, t * 1.3) * (0.7 + Math.random() * 0.3)
        ctx.strokeStyle = s.color
        ctx.shadowColor = s.color
        ctx.shadowBlur = 8
        ctx.lineWidth = s.size
        ctx.beginPath()
        ctx.moveTo(s.px, s.py)
        ctx.lineTo(s.x, s.y)
        ctx.stroke()
        return s.life > 0
      })
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [ambient])

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />
})

export default Fireworks
