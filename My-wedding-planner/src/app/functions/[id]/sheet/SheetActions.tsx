'use client'

import { Printer, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SheetActions({ shareText }: { shareText: string }) {
  return (
    <div className="flex gap-2 print:hidden">
      <Button size="sm" variant="outline" onClick={() => window.print()} className="border-marigold/50 text-maroon hover:bg-marigold/10 h-8 text-xs rounded-full">
        <Printer className="w-3.5 h-3.5 mr-1" /> Print / PDF
      </Button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center h-8 px-3 text-xs font-semibold rounded-full bg-mehendi text-white hover:opacity-90"
      >
        <Share2 className="w-3.5 h-3.5 mr-1" /> WhatsApp
      </a>
    </div>
  )
}
