import { type ComponentType, type ReactNode } from 'react'
import {
  Sun,
  Palette,
  Type,
  LayoutGrid,
  Square,
  Eye,
  Sparkles,
  Check,
  RotateCcw,
} from 'lucide-react'
import clsx from 'clsx'
import { useSettings } from '../hooks/useSettings'
import { SurfaceCard } from '../components/ui'
import { Button } from '../shared/components/Button'
import type { ThemeAccent, UiSettings } from '../types/api'

const ACCENT_SWATCH: Record<ThemeAccent, string> = {
  mono: '#1C1917',
  clay: '#8A4A32',
  taupe: '#6B5D4F',
  ochre: '#7A5D26',
  plum: '#6B2C3D',
  charcoal: '#3F3A36',
}

const ACCENT_LABELS: Record<ThemeAccent, string> = {
  mono: 'Monochrome',
  clay: 'Clay',
  taupe: 'Taupe',
  ochre: 'Ochre',
  plum: 'Plum',
  charcoal: 'Charcoal',
}

const PRESETS: { key: string; label: string; description: string; patch: Partial<UiSettings> }[] = [
  {
    key: 'editorial',
    label: 'Editorial',
    description: 'The default look — warm paper, monochrome, serif headings.',
    patch: {
      mode: 'light', accent: 'mono', typography: 'editorial',
      density: 'comfortable', radius: 'rounded', separation: 'border',
    },
  },
  {
    key: 'minimal',
    label: 'Minimal',
    description: 'Tighter, all-grotesk, sharp corners.',
    patch: {
      mode: 'light', accent: 'mono', typography: 'clean',
      density: 'compact', radius: 'sharp', separation: 'border',
    },
  },
  {
    key: 'warm',
    label: 'Warm',
    description: 'A touch of clay, softer separation via shadow.',
    patch: {
      mode: 'light', accent: 'clay', typography: 'editorial',
      density: 'comfortable', radius: 'rounded', separation: 'shadow',
    },
  },
  {
    key: 'high_contrast',
    label: 'High Contrast',
    description: 'Maximum contrast for low vision — overrides colour/mode.',
    patch: {
      mode: 'light', accent: 'mono', typography: 'editorial',
      density: 'comfortable', radius: 'rounded', separation: 'border',
      high_contrast: true,
    },
  },
]

function SectionHeader({
  icon: Icon, title, description,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Icon className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
        <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      </div>
      <p className="text-sm text-ink-muted">{description}</p>
    </div>
  )
}

function OptionButton({
  selected, onClick, label, swatch, sublabel,
}: {
  selected: boolean
  onClick: () => void
  label: string
  swatch?: string
  sublabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        'flex items-center gap-2.5 px-4 py-3 rounded border text-sm text-left transition-colors',
        selected
          ? 'border-ink bg-accent-subtle text-ink'
          : 'border-line-strong text-ink-muted hover:bg-paper hover:text-ink',
      )}
    >
      {swatch && (
        <span
          className="w-4 h-4 rounded-full border border-line-strong shrink-0"
          style={{ background: swatch }}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0">
        <span className="font-medium block">{label}</span>
        {sublabel && <span className="text-xs text-ink-faint block mt-0.5">{sublabel}</span>}
      </span>
      {selected && <Check className="w-4 h-4 ml-auto shrink-0" aria-hidden="true" />}
    </button>
  )
}

function ToggleRow({
  label, description, checked, onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded border text-sm transition-colors w-full text-left',
        checked ? 'border-ink bg-accent-subtle text-ink' : 'border-line-strong text-ink-muted hover:bg-paper',
      )}
    >
      <span
        className={clsx(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-ink bg-ink' : 'border-line-strong bg-paper',
        )}
      >
        <span
          className={clsx(
            'pointer-events-none absolute top-0.5 h-3.5 w-3.5 rounded-full bg-paper transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
      <span>
        <span className="font-medium block">{label}</span>
        <span className="text-xs text-ink-faint">{description}</span>
      </span>
    </button>
  )
}

function Section({ children }: { children: ReactNode }) {
  return (
    <SurfaceCard>
      {children}
    </SurfaceCard>
  )
}

export default function UiSettingsPage() {
  const { draft, committed, isSaving, updateDraft, applyDraft, cancelDraft, resetDraft } = useSettings()

  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(committed)

  return (
    <div className="max-w-3xl mx-auto pb-32">
      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mb-4">
        Settings
      </p>
      <h1 className="font-display text-3xl md:text-4xl font-medium text-ink leading-[1.1]">
        Appearance &amp; preferences
      </h1>
      <p className="mt-4 text-ink-muted leading-7 max-w-xl">
        Every option here stays within VisionLab&rsquo;s design system — no gradients, no glow,
        nothing that clashes. Changes preview instantly; nothing is saved until you press Apply.
      </p>

      <div className="mt-8 space-y-5">
        {/* 1. Appearance */}
        <Section>
          <SectionHeader icon={Sun} title="Appearance" description="Light, dark, or match your system." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <OptionButton label="Light" sublabel="Warm paper (default)" selected={(draft.mode ?? 'light') === 'light'} onClick={() => updateDraft({ mode: 'light' })} />
            <OptionButton label="Dark" sublabel="Warm near-black" selected={draft.mode === 'dark'} onClick={() => updateDraft({ mode: 'dark' })} />
            <OptionButton label="System" sublabel="Follow OS setting" selected={draft.mode === 'system'} onClick={() => updateDraft({ mode: 'system' })} />
          </div>
        </Section>

        {/* 2. Accent */}
        <Section>
          <SectionHeader icon={Palette} title="Accent" description="Used sparingly — primary actions and small highlights only. No blue, no green, never a gradient." />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {(Object.keys(ACCENT_LABELS) as ThemeAccent[]).map((accent) => (
              <OptionButton
                key={accent}
                label={ACCENT_LABELS[accent]}
                swatch={ACCENT_SWATCH[accent]}
                selected={(draft.accent ?? 'mono') === accent}
                onClick={() => updateDraft({ accent })}
              />
            ))}
          </div>
        </Section>

        {/* 3. Typography */}
        <Section>
          <SectionHeader icon={Type} title="Typography" description="Font pairing, text size, and reading comfort." />
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <OptionButton label="Editorial" sublabel="Serif headings + sans body" selected={(draft.typography ?? 'editorial') === 'editorial'} onClick={() => updateDraft({ typography: 'editorial' })} />
              <OptionButton label="Clean" sublabel="All-grotesk" selected={draft.typography === 'clean'} onClick={() => updateDraft({ typography: 'clean' })} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-ink">Text size</p>
                <span className="text-xs font-mono text-ink-faint tabular-nums">{draft.font_size ?? 16}px</span>
              </div>
              <input
                type="range"
                className="w-full accent-ink"
                min={14}
                max={18}
                step={2}
                value={draft.font_size ?? 16}
                onChange={(e) => updateDraft({ font_size: Number(e.target.value) as UiSettings['font_size'] })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <OptionButton label="Normal" sublabel="Default line spacing" selected={(draft.reading_comfort ?? 'normal') === 'normal'} onClick={() => updateDraft({ reading_comfort: 'normal' })} />
              <OptionButton label="Relaxed" sublabel="More breathing room in body text" selected={draft.reading_comfort === 'relaxed'} onClick={() => updateDraft({ reading_comfort: 'relaxed' })} />
            </div>
          </div>
        </Section>

        {/* 4. Density & layout */}
        <Section>
          <SectionHeader icon={LayoutGrid} title="Density & layout" description="How tightly content is spaced." />
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <OptionButton label="Comfortable" sublabel="Default spacing" selected={(draft.density ?? 'comfortable') === 'comfortable'} onClick={() => updateDraft({ density: 'comfortable' })} />
              <OptionButton label="Compact" sublabel="Tighter cards & navigation" selected={draft.density === 'compact'} onClick={() => updateDraft({ density: 'compact' })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <OptionButton label="Sidebar expanded" selected={(draft.sidebar ?? 'expanded') === 'expanded'} onClick={() => updateDraft({ sidebar: 'expanded' })} />
              <OptionButton label="Sidebar collapsed" sublabel="Icon-only rail" selected={draft.sidebar === 'collapsed'} onClick={() => updateDraft({ sidebar: 'collapsed' })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <OptionButton label="Wide content" sublabel="Default — edge to edge" selected={(draft.content_width ?? 'wide') === 'wide'} onClick={() => updateDraft({ content_width: 'wide' })} />
              <OptionButton label="Standard content" sublabel="Contained reading width" selected={draft.content_width === 'standard'} onClick={() => updateDraft({ content_width: 'standard' })} />
            </div>
          </div>
        </Section>

        {/* 5. Surface & shape */}
        <Section>
          <SectionHeader icon={Square} title="Surface & shape" description="Corner radius and how cards separate from the page. Flat surfaces only — no glass, no glow." />
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <OptionButton label="Rounded" sublabel="Default — small radius" selected={(draft.radius ?? 'rounded') === 'rounded'} onClick={() => updateDraft({ radius: 'rounded' })} />
              <OptionButton label="Sharp" sublabel="Near-square corners" selected={draft.radius === 'sharp'} onClick={() => updateDraft({ radius: 'sharp' })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <OptionButton label="Hairline border" sublabel="Default separation" selected={(draft.separation ?? 'border') === 'border'} onClick={() => updateDraft({ separation: 'border' })} />
              <OptionButton label="Subtle shadow" sublabel="Borderless cards" selected={draft.separation === 'shadow'} onClick={() => updateDraft({ separation: 'shadow' })} />
            </div>
          </div>
        </Section>

        {/* 6. Accessibility */}
        <Section>
          <SectionHeader icon={Eye} title="Accessibility" description="Motion, contrast, and link visibility." />
          <div className="space-y-3">
            <ToggleRow
              label="Reduce motion"
              description="Turns off animations and transitions"
              checked={!!draft.reduce_motion}
              onChange={(v) => updateDraft({ reduce_motion: v })}
            />
            <ToggleRow
              label="High contrast"
              description="Maximum contrast, colour-coded status — overrides Appearance and Accent while active"
              checked={!!draft.high_contrast}
              onChange={(v) => updateDraft({ high_contrast: v })}
            />
            <ToggleRow
              label="Underline links"
              description="Adds an underline to every link, not just on hover"
              checked={!!draft.underline_links}
              onChange={(v) => updateDraft({ underline_links: v })}
            />
          </div>
        </Section>

        {/* 7. Presets */}
        <Section>
          <SectionHeader icon={Sparkles} title="Presets" description="One click to bundle Appearance, Accent, Typography, Density and Shape together." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => updateDraft(preset.patch)}
                className="flex flex-col items-start gap-1 px-4 py-3 rounded border border-line-strong text-left hover:bg-paper hover:border-ink-faint transition-colors"
              >
                <span className="font-medium text-sm text-ink">{preset.label}</span>
                <span className="text-xs text-ink-faint">{preset.description}</span>
              </button>
            ))}
          </div>
        </Section>
      </div>

      {/* 8. Actions */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 border-t border-line bg-paper-raised px-6 py-4 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetDraft}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset to defaults
          </button>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && !isSaving && (
              <span className="text-xs text-ink-faint hidden sm:inline">Unsaved changes</span>
            )}
            <Button variant="secondary" size="md" onClick={cancelDraft} disabled={!hasUnsavedChanges}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={applyDraft} loading={isSaving} disabled={!hasUnsavedChanges && !isSaving}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
