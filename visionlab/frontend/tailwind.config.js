/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Every color here resolves through a CSS custom property (defined
        // in src/styles/index.css) instead of a static hex value. This is
        // what makes live theme switching (mode/accent/etc, see useSettings)
        // possible without touching component code — Tailwind still
        // generates `bg-paper`/`text-ink`/etc. utility classes as normal,
        // they just compile to `var(--color-x)` lookups. The DEFAULT values
        // of those custom properties (in index.css :root) are the unchanged
        // monochrome warm-neutral system — no chromatic accent by default.
        paper: {
          DEFAULT: 'var(--color-bg)',
          raised:  'var(--color-surface)',
        },
        ink: {
          DEFAULT:  'var(--color-text)',
          muted:    'var(--color-text-muted)',
          faint:    'var(--color-text-faint)', // reserved for large text/icons only
          onaccent: 'var(--color-text-onaccent)',
        },
        line: {
          DEFAULT: 'var(--color-border)',
          strong:  'var(--color-border-strong)',
        },
        // "accent" = the primary-action color. Weight by default (monochrome),
        // optionally a curated hue (see .accent-* classes in index.css).
        accent: {
          DEFAULT: 'var(--color-primary)',
          hover:   'var(--color-primary-hover)',
          active:  'var(--color-primary-active)',
          subtle:  'var(--color-primary-subtle)',
        },
        // Status is conveyed by weight/darkness + the mono text label
        // itself (e.g. "failed"), never by hue, in the default theme.
        positive: { DEFAULT: 'var(--color-success)', subtle: 'var(--color-success-subtle)' },
        caution:  { DEFAULT: 'var(--color-warning)', subtle: 'var(--color-warning-subtle)' },
        negative: { DEFAULT: 'var(--color-error)',   subtle: 'var(--color-error-subtle)' },
      },
      fontFamily: {
        // Editorial serif for headings by default — deliberately not another
        // AI-SaaS grotesk-on-dark template. Driven by a CSS var so the
        // Typography "Clean" setting can swap it for the sans font live
        // (see .font-clean in index.css) without a rebuild.
        display: ['var(--font-display)', 'Fraunces', 'Georgia', 'serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        // Mono is a deliberate technical signature — used for every
        // confidence %, step timing, model name, and ID in the product.
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      borderRadius: {
        // Driven by CSS vars so the Surface & Shape "Sharp" setting can
        // flatten these live (see .radius-sharp in index.css). Defaults
        // match the unchanged current values.
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-default)',
        md: 'var(--radius-default)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        // One subtle lift only. No glow, ever.
        card:   'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
      },
      animation: {
        // Minimal, functional only.
        'fade-in': 'fadeIn 0.25s ease-out both',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
