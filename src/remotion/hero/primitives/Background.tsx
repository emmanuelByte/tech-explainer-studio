import { AbsoluteFill } from 'remotion'
import { T } from '../theme'

/** Navy field with a soft centre glow and a faint dot grid. */
export const Background = () => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 45%, ${T.bg1} 0%, ${T.bg0} 75%)` }}>
    <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.09 }}>
      <defs>
        <pattern id="dots" width="36" height="36" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="2" fill="#9DB4E0" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }} />
  </AbsoluteFill>
)
