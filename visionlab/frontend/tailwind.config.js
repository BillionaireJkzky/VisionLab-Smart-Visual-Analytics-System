/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        void: {
          950: '#010408',
          900: '#020a14',
          800: '#060f1d',
          700: '#0b1929',
          600: '#112035',
        },
        aurora: {
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#00b8d9',
          600: '#0e7490',
        },
        plasma: {
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
        nebula: {
          300: '#f5d0fe',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
        },
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        calm: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
        },
      },
      fontFamily: {
        sans:    ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Nunito', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        inter:   ['Inter', '"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':      'fadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-up':     'slideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'aurora':       'aurora 14s ease-in-out infinite',
        'aurora-slow':  'aurora 22s ease-in-out infinite reverse',
        'aurora-alt':   'auroraAlt 18s ease-in-out infinite',
        'shimmer':      'shimmer 2.5s linear infinite',
        'glow-pulse':   'glowPulse 3.5s ease-in-out infinite',
        'float':        'float 7s ease-in-out infinite',
        'float-slow':   'float 11s ease-in-out infinite reverse',
        'float-soft':   'floatSoft 6s ease-in-out infinite',
        'breathe':      'breathe 4s ease-in-out infinite',
        'pulse-slow':   'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate(0%, 0%) scale(1)',    opacity: '0.6' },
          '25%':       { transform: 'translate(4%, -5%) scale(1.07)', opacity: '0.8' },
          '50%':       { transform: 'translate(-3%, 4%) scale(1.02)', opacity: '0.5' },
          '75%':       { transform: 'translate(-5%, -2%) scale(0.96)', opacity: '0.7' },
        },
        auroraAlt: {
          '0%, 100%': { transform: 'translate(0%, 0%) scale(1)',    opacity: '0.4' },
          '33%':       { transform: 'translate(-4%, 3%) scale(1.09)', opacity: '0.65' },
          '66%':       { transform: 'translate(3%, -5%) scale(0.93)', opacity: '0.45' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-400px center' },
          '100%': { backgroundPosition:  '400px center' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%':       { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-10px)' },
        },
        floatSoft: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-5px)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)',    opacity: '0.55' },
          '50%':       { transform: 'scale(1.06)', opacity: '1' },
        },
      },
      boxShadow: {
        'aurora':    '0 0 40px rgba(34,211,238,0.25), 0 0 80px rgba(34,211,238,0.1)',
        'aurora-lg': '0 0 60px rgba(34,211,238,0.3), 0 0 120px rgba(34,211,238,0.12)',
        'plasma':    '0 0 40px rgba(139,92,246,0.25), 0 0 80px rgba(139,92,246,0.1)',
        'nebula':    '0 0 40px rgba(217,70,239,0.25), 0 0 80px rgba(217,70,239,0.1)',
        'glow-sm':   '0 0 12px rgba(34,211,238,0.3)',
        'glow':      '0 0 24px rgba(34,211,238,0.3), 0 0 48px rgba(34,211,238,0.1)',
        'glow-lg':   '0 0 48px rgba(34,211,238,0.35), 0 0 96px rgba(34,211,238,0.14)',
        'inner-top': 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backdropBlur: {
        '2xl': '32px',
        '3xl': '48px',
        '4xl': '64px',
      },
    },
  },
  plugins: [],
}
