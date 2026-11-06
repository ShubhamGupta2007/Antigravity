'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type FireworksHandle = {
  /** A few big bursts at once (seal broken, Enter) */
  celebrate: (bursts?: number) => void
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; sprite: HTMLCanvasElement; size: number }
type Rocket = { x: number; y: number; vy: number; targetY: number; sprite: HTMLCanvasElement }

const COLORS = ['#F2C46D', '#FFE6A8', '#F59E0B', '#F472B6', '#FB7185', '#FFF6E0', '#A3E635', '#FDBA74']
const MAX_SPARKS = 420

/** A soft glowing dot, drawn once per colour and stamped for every spark (far cheaper than canvas blur). */
function makeSprite(color: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 24
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(12, 12, 0, 12, 12, 12)
  grad.addColorStop(0, '#FFFFFF')
  grad.addColorStop(0.25, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 24, 24)
  return c
}

/**
 * Festive fireworks over the night sky: an occasional rocket rises and bursts high up, away
 * from the text, and `celebrate()` sets off a volley. One canvas, kept light for phones: glow
 * sprites instead of blur, a cap on sparks, and no drawing at all while nothing is in the air,
 * the canvas is off screen or the tab is hidden. Nothing runs for reduced motion.
 */
const Fireworks = forwardRef<FireworksHandle, { ambient?: boolean; className?: string; pauseWhen?: string }>(function Fireworks({ ambient = true, className = '', pauseWhen }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The running animation's controls, so celebrate() can wake it
  const engine = useRef<{ launch: (big: boolean) => void; wake: () => void } | null>(null)

  useImperativeHandle(ref, () => ({
    celebrate: (bursts = 6) => {
      const e = engine.current
      if (!e) return
      for (let i = 0; i < bursts; i++) window.setTimeout(() => { e.launch(true); e.wake() }, i * 120)
    }
  }))

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const sprites = COLORS.map(makeSprite)
    const pick = () => sprites[Math.floor(Math.random() * sprites.length)]
    let sparks: Spark[] = []
    let rockets: Rocket[] = []
    let raf = 0
    let running = false
    let visible = true
    let last = 0
    let timer = 0
    // Fewer fireworks on modest phones
    const slow = (navigator.hardwareConcurrency || 4) <= 4
    const gap = slow ? 2600 : 1600

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const burst = (x: number, y: number, sprite: HTMLCanvasElement, power: number) => {
      const count = Math.min(slow ? 45 : 70, MAX_SPARKS - sparks.length)
      const second = pick()
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + Math.random() * 0.25
        const speed = (1.8 + Math.random() * 2.6) * power
        const max = 60 + Math.random() * 40
        sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: max, max, sprite: i % 3 === 0 ? second : sprite, size: 7 + Math.random() * 5 })
      }
    }

    const launch = (big: boolean) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || rockets.length > 10) return
      rockets.push({
        x: w * (0.12 + Math.random() * 0.76),
        y: h + 10,
        vy: -(big ? 13 : 8) - Math.random() * 2.5,
        // Top third of the screen (a little lower for the finale), clear of the card and buttons
        targetY: h * (big ? 0.12 + Math.random() * 0.3 : 0.08 + Math.random() * 0.22),
        sprite: pick()
      })
    }

    const frame = (now: number) => {
      const dt = Math.min(2.5, last ? (now - last) / 16.7 : 1)
      last = now
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      rockets = rockets.filter(r => {
        r.y += r.vy * dt
        r.vy += 0.06 * dt
        ctx.globalAlpha = 0.9
        ctx.drawImage(r.sprite, r.x - 5, r.y - 5, 10, 10)
        ctx.drawImage(r.sprite, r.x - 3, r.y + 6, 6, 6)
        if (r.y <= r.targetY || r.vy >= -1) {
          burst(r.x, r.y, r.sprite, r.vy < -10 ? 1.2 : 1)
          return false
        }
        return true
      })

      sparks = sparks.filter(s => {
        s.vx *= 0.985
        s.vy = s.vy * 0.985 + 0.035 * dt
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.life -= dt
        const t = s.life / s.max
        if (t <= 0) return false
        ctx.globalAlpha = t > 0.3 ? 1 : t / 0.3
        const size = s.size * (0.6 + t * 0.4)
        ctx.drawImage(s.sprite, s.x - size / 2, s.y - size / 2, size, size)
        return true
      })
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // Sleep whenever the sky is empty; the ambient timer or celebrate() wakes it
      if (rockets.length === 0 && sparks.length === 0) {
        running = false
        last = 0
        return
      }
      raf = requestAnimationFrame(frame)
    }

    const wake = () => {
      if (running) return
      running = true
      last = 0
      raf = requestAnimationFrame(frame)
    }
    engine.current = { launch, wake }

    // Gentle ambient bursts on a timer, skipped while off screen, in a background tab, or while
    // something covers this canvas (e.g. the envelope over the opening page)
    const blocked = () => !visible || document.hidden || (!!pauseWhen && !!document.querySelector(pauseWhen))
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (!blocked()) { launch(false); wake() }
        schedule(gap + Math.random() * gap)
      }, delay)
    }
    if (ambient) schedule(700)

    // Pause while scrolled away or in a background tab
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
    })
    io.observe(canvas)
    const onVisibility = () => { if (!document.hidden) wake() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', resize)
    resize()

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      running = false
      engine.current = null
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', resize)
    }
  }, [ambient, pauseWhen])

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />
})

export default Fireworks
