'use client'

import { useEffect, useRef, useState } from 'react'
import { GaneshJi, LotusPond, NightSky } from './Decor'
import Fireworks, { type FireworksHandle } from './Fireworks'

/**
 * Full-screen sealed envelope shown over the invitation. Tapping the wax seal opens the
 * flap and slides the card out; "Enter" reveals the invitation underneath. Shown once per
 * visit (remembered for the browser session).
 */
export default function Envelope({ code, title, bride, groom }: { code: string; title: string; bride: string; groom: string }) {
  const storageKey = `inv-opened-${code}`
  const [stage, setStage] = useState<'sealed' | 'open' | 'gone'>('sealed')
  const [showEnter, setShowEnter] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const fireworks = useRef<FireworksHandle>(null)

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring "already opened" after hydration
      if (window.sessionStorage.getItem(storageKey) === '1') setStage('gone')
    } catch {
      // storage unavailable: show the envelope
    }
  }, [storageKey])

  useEffect(() => {
    if (stage === 'gone') {
      document.body.style.overflow = ''
      return
    }
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [stage])

  const open = () => {
    setStage('open')
    fireworks.current?.celebrate(3)
    window.setTimeout(() => setShowEnter(true), 30)
  }
  const enter = () => {
    try { window.sessionStorage.setItem(storageKey, '1') } catch { /* ignore */ }
    // A grand volley, then into the invitation
    fireworks.current?.celebrate(9)
    setLeaving(true)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => setStage('gone'), reduce ? 0 : 1300)
  }

  const opened = stage !== 'sealed'
  const [first, ...rest] = title.split(' Family')
  return (
    <div
      role="dialog"
      aria-modal={stage !== 'gone'}
      aria-label="Your invitation"
      className={`inv-envelope-out fixed inset-0 z-50 flex flex-col items-center overflow-hidden bg-[#3A0B20] px-5 text-[#FFF6E9] ${stage === 'gone' ? 'invisible opacity-0' : 'visible opacity-100'}`}
    >
      <NightSky />
      <Fireworks ref={fireworks} ambient={stage !== 'gone'} />
      <LotusPond />

      <GaneshJi className="inv-ganesh relative mt-[3vh] h-[clamp(64px,11vh,92px)] w-auto" />
      <p className="inv-rise relative mt-2 font-[family-name:var(--font-devanagari)] text-[17px] text-[#F2C46D]" style={{ animationDelay: '0.3s' }}>॥ श्री गणेशाय नमः ॥</p>
      <p className="inv-rise relative mt-[3vh] font-data text-xs uppercase tracking-[4px] text-[#E9CBA7]" style={{ animationDelay: '0.5s' }}>With love, for</p>
      <div className="inv-rise relative" style={{ animationDelay: '0.7s' }}>
        <h1 className="inv-gold mt-2 pb-2 text-center px-4 font-display text-[54px] font-bold italic leading-[1.02] tracking-tight drop-shadow-[0_0_18px_rgba(242,196,109,0.25)]">
          {first}{rest.length ? <><br />Family</> : null}
        </h1>
      </div>

      <div className="inv-env-stage relative mt-[2vh]">
      <div className="inv-rise relative h-[300px] w-[310px]" style={{ animationDelay: '0.95s' }}>
        <div className="inv-float absolute inset-0">
          <div
            className={`absolute left-[14px] right-[14px] top-[96px] z-[2] flex h-[200px] flex-col items-center justify-center overflow-hidden rounded-[10px] bg-[#FFF8EE] shadow-[0_10px_30px_rgba(0,0,0,0.25)] ${opened ? 'inv-pull inv-card-glow' : ''}`}
          >
            {/* Gold inner frame with little corner flourishes */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-[7px] rounded-[7px] border border-[#D9A441]/60" />
            <span aria-hidden="true" className="pointer-events-none absolute left-[11px] top-[11px] text-[10px] text-[#C9973F]">✦</span>
            <span aria-hidden="true" className="pointer-events-none absolute right-[11px] top-[11px] text-[10px] text-[#C9973F]">✦</span>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-[11px] left-[11px] text-[10px] text-[#C9973F]">✦</span>
            <span aria-hidden="true" className="pointer-events-none absolute bottom-[11px] right-[11px] text-[10px] text-[#C9973F]">✦</span>
            <p className="mb-2 font-data text-[10px] uppercase tracking-[4px] text-[#8A5A44]">The wedding of</p>
            <p className="font-[family-name:var(--font-script)] text-[42px] leading-[1.05] text-[#7A1F3A]">{bride}</p>
            <p className="-my-1 font-display text-lg italic text-[#B8862F]">&amp;</p>
            <p className="font-[family-name:var(--font-script)] text-[42px] leading-[1.05] text-[#7A1F3A]">{groom}</p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 z-[3] h-[210px] rounded-xl bg-[#F6E7D2] shadow-[0_22px_50px_rgba(0,0,0,0.45)]">
            <svg aria-hidden="true" viewBox="0 0 310 210" className="absolute inset-0 h-full w-full">
              <path d="M0 200 L155 96 L310 200" fill="#EBD3B2" stroke="#C9973F" strokeWidth="1" />
              <path d="M0 12 L120 120 M310 12 L190 120" stroke="#E0C49F" strokeWidth="1" />
            </svg>
          </div>
          <div className="inv-flap absolute left-0 right-0 top-[90px] h-[120px]" style={{ zIndex: opened ? 1 : 4, transform: opened ? 'rotateX(180deg) translateY(-2px)' : 'none' }}>
            <svg aria-hidden="true" viewBox="0 0 310 120" className="absolute inset-0 h-full w-full">
              <path d="M0 10 Q0 0 10 0 H300 Q310 0 310 10 V12 L155 118 L0 12 Z" fill="#EAD0AC" stroke="#C9973F" strokeWidth="1" />
            </svg>
          </div>
          {!opened && (
            <button
              type="button"
              onClick={open}
              aria-label="Break the seal to open your invitation"
              className="inv-seal absolute left-1/2 top-[166px] z-[5] -ml-[42px] flex h-[84px] w-[84px] cursor-pointer items-center justify-center rounded-full border-0 bg-[#8E1F2F]"
            >
              <span className="font-display text-[30px] font-bold tracking-wide text-[#F2C46D]">{bride.charAt(0)}·{groom.charAt(0)}</span>
            </button>
          )}
        </div>
      </div>

      </div>

      {!opened ? (
        <p className="inv-rise relative z-10 mt-6 font-data text-sm text-[#F3DFC4]" style={{ animationDelay: '1.2s' }}>Tap the seal to open</p>
      ) : (
        <button
          type="button"
          onClick={enter}
          disabled={leaving}
          className="inv-fade inv-enter relative z-10 mt-7 flex h-14 w-full max-w-[320px] items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#F2C46D] via-[#FFE6A8] to-[#F2C46D] font-data text-base font-bold text-[#3A0B20] shadow-[0_10px_26px_rgba(0,0,0,0.35)]"
          style={{ opacity: showEnter ? 1 : 0 }}
          aria-label="Enter the invitation"
        >
          <span className="font-[family-name:var(--font-devanagari)] text-[19px]">{leaving ? '✨ स्वागत है ✨' : '🙏 पधारिए'}</span>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
        </button>
      )}
    </div>
  )
}
