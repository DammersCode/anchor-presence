import type { ReactNode, SVGProps } from "react";

// Ported from site/index.html's inline SVG symbol: corner brackets around a cursor glyph.
export function Logo(props: SVGProps<SVGSVGElement>): ReactNode {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="ap-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 10V5h5" />
        <path d="M22 5h5v5" />
        <path d="M27 22v5h-5" />
        <path d="M10 27H5v-5" />
      </g>
      <path
        d="M0 0 L0 12 L3 9.3 L4.7 13 L6.9 12.1 L5.1 8.3 L8.2 7.5 Z"
        transform="translate(12.2,7.2) scale(1.3)"
        fill="url(#ap-logo-grad)"
      />
    </svg>
  );
}
