import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Locked palette — matches gbrain admin SPA aesthetic
        bg: '#0a0a0f',
        surface: '#13131a',
        border: '#26262e',
        text: {
          DEFAULT: '#f5f5f7',
          muted: '#a1a1aa',
          dim: '#6b6b75',
        },
        accent: {
          DEFAULT: '#a78bfa', // violet primary, projector-safe on #0a0a0f
          dim: '#7c66c9',
        },
        status: {
          active: '#4ade80', // green
          waiting: '#fbbf24', // yellow
          errored: '#f87171', // red
          idle: '#6b6b75', // gray
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Bumped base for projector readability — see design doc
        base: ['18px', { lineHeight: '1.5' }],
      },
      animation: {
        // Active-entity pulse: scale 1 -> 1.15 + glow, 800ms ease-out, loops
        'entity-pulse': 'entity-pulse 800ms ease-out infinite',
      },
      keyframes: {
        'entity-pulse': {
          '0%, 100%': {
            transform: 'scale(1)',
            filter: 'drop-shadow(0 0 0 rgba(167, 139, 250, 0))',
          },
          '50%': {
            transform: 'scale(1.15)',
            filter: 'drop-shadow(0 0 12px rgba(167, 139, 250, 0.8))',
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
