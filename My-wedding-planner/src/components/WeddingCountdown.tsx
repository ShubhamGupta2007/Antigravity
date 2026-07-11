'use client'

import { useState, useEffect } from 'react'

export function WeddingCountdown({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  })

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - new Date().getTime()
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        })
      }
    }

    // Initial calculation
    calculateTimeLeft()
    
    // Update every second
    const timer = setInterval(calculateTimeLeft, 1000)
    return () => clearInterval(timer)
  }, [targetDate])

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white/50 backdrop-blur-sm rounded-3xl border border-marigold/30 shadow-sm">
      <div className="grid grid-cols-4 gap-2 md:gap-4 text-center">
        <TimeUnit value={timeLeft.days} label="Days" />
        <TimeUnit value={timeLeft.hours} label="Hours" />
        <TimeUnit value={timeLeft.minutes} label="Mins" />
        <TimeUnit value={timeLeft.seconds} label="Secs" />
      </div>
    </div>
  )
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 md:p-4 bg-ivory rounded-2xl border border-marigold/20 shadow-inner">
      <span className="text-3xl md:text-5xl font-display font-bold text-maroon mb-1">
        {value.toString().padStart(2, '0')}
      </span>
      <span className="text-xs md:text-sm font-data uppercase tracking-widest text-maroon/70">
        {label}
      </span>
    </div>
  )
}
