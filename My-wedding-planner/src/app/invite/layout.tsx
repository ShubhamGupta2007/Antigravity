import type { Metadata } from 'next'
import { Tiro_Devanagari_Hindi } from 'next/font/google'
import './invite.css'

const devanagari = Tiro_Devanagari_Hindi({ weight: '400', subsets: ['devanagari'], variable: '--font-devanagari' })

export const metadata: Metadata = {
  title: 'You are invited',
  description: 'A personal wedding invitation',
  // Private links: keep them out of search engines
  robots: { index: false, follow: false }
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${devanagari.variable} min-h-screen bg-[#3A0B20]`}>{children}</div>
}
