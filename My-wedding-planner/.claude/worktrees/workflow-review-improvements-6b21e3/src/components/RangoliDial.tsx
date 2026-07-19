import React from 'react';

/**
 * A recurring rangoli-ring motif used for branding and aesthetics.
 * It features a rotating SVG mandala pattern.
 */
export function RangoliDial({ 
  size = 120, 
  className = '' 
}: { 
  size?: number;
  className?: string;
}) {
  return (
    <div 
      className={`relative flex items-center justify-center rounded-full bg-ivory shadow-lg border border-marigold/30 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer rotating ring */}
      <div className="absolute inset-0 animate-[spin_30s_linear_infinite]">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-maroon/20">
          <circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4"/>
          {/* Creating a simple geometric mandala/rangoli pattern using SVG paths */}
          <path d="M50 2 L52 10 L60 12 L53 18 L55 26 L50 21 L45 26 L47 18 L40 12 L48 10 Z" fill="currentColor" transform="rotate(0 50 50)"/>
          <path d="M50 2 L52 10 L60 12 L53 18 L55 26 L50 21 L45 26 L47 18 L40 12 L48 10 Z" fill="currentColor" transform="rotate(45 50 50)"/>
          <path d="M50 2 L52 10 L60 12 L53 18 L55 26 L50 21 L45 26 L47 18 L40 12 L48 10 Z" fill="currentColor" transform="rotate(90 50 50)"/>
          <path d="M50 2 L52 10 L60 12 L53 18 L55 26 L50 21 L45 26 L47 18 L40 12 L48 10 Z" fill="currentColor" transform="rotate(135 50 50)"/>
          <path d="M50 2 L52 10 L60 12 L53 18 L55 26 L50 21 L45 26 L47 18 L40 12 L48 10 Z" fill="currentColor" transform="rotate(180 50 50)"/>
          <path d="M50 2 L52 10 L60 12 L53 18 L55 26 L50 21 L45 26 L47 18 L40 12 L48 10 Z" fill="currentColor" transform="rotate(225 50 50)"/>
          <path d="M50 2 L52 10 L60 12 L53 18 L55 26 L50 21 L45 26 L47 18 L40 12 L48 10 Z" fill="currentColor" transform="rotate(270 50 50)"/>
          <path d="M50 2 L52 10 L60 12 L53 18 L55 26 L50 21 L45 26 L47 18 L40 12 L48 10 Z" fill="currentColor" transform="rotate(315 50 50)"/>
        </svg>
      </div>
      
      {/* Inner stable circle */}
      <div className="absolute inset-2 rounded-full border-2 border-marigold flex items-center justify-center bg-ivory">
        <span className="font-display text-4xl text-maroon">W</span>
      </div>
    </div>
  );
}
