export function StemuxIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        <filter id="elevation2" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
          <feOffset dx="0" dy="1" result="offsetblur"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.12"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#4ECDC4', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#45bcb4', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id="grad2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#FFA07A', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#ff906a', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id="grad3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#BB8FCE', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#ab7fbe', stopOpacity: 1 }} />
        </linearGradient>

        <linearGradient id="highlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#ffffff', stopOpacity: 0.2 }} />
          <stop offset="50%" style={{ stopColor: '#ffffff', stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      {/*<circle cx="128" cy="128" r="120" fill="currentColor" opacity="0.1"/>*/}

      <g filter="url(#elevation2)">
        <rect x="50" y="68" width="156" height="32" rx="16" fill="url(#grad1)"/>
        <rect x="50" y="68" width="156" height="32" rx="16" fill="url(#highlight)"/>

        <rect x="40" y="112" width="176" height="32" rx="16" fill="url(#grad2)"/>
        <rect x="40" y="112" width="176" height="32" rx="16" fill="url(#highlight)"/>

        <rect x="60" y="156" width="136" height="32" rx="16" fill="url(#grad3)"/>
        <rect x="60" y="156" width="136" height="32" rx="16" fill="url(#highlight)"/>
      </g>
    </svg>
  );
}
