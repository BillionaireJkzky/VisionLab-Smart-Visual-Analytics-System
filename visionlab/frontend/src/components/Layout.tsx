import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  Eye,
  Upload,
  History,
  BarChart2,
  BookOpen,
  ShieldCheck,
  LogOut,
  Settings,
  Sparkles,
  X,
  Menu,
  Palette,
  Type,
  LayoutGrid,
  Wand2,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard', label: 'Dashboard',     icon: BarChart2 },
  { to: '/analyse',   label: 'Analyse Image', icon: Upload    },
  { to: '/history',   label: 'History',       icon: History   },
  { to: '/progress',  label: 'My Progress',   icon: BookOpen  },
]

type ThemeColor   = 'cyan' | 'violet' | 'emerald' | 'rose' | 'amber'
type FontColor    = 'slate' | 'white' | 'cyan' | 'emerald' | 'rose'
type FontSize     = 14 | 16 | 18 | 20
type CardRadius   = 16 | 20 | 24 | 28 | 32
type Density      = 12 | 20 | 28
type FontFamily   = 'Space Grotesk' | 'Outfit' | 'Inter' | 'Nunito' | 'Poppins' | 'Manrope'
type CardStyle    = 'glass' | 'soft' | 'sharp' | 'glow'
type DisplayMode  = 'dark' | 'midnight' | 'forest' | 'dim' | 'light'
type SettingsTab  = 'theme' | 'typography' | 'layout' | 'presets'

type UiSettings = {
  themeColor:  ThemeColor
  fontColor:   FontColor
  fontSize:    FontSize
  cardRadius:  CardRadius
  density:     Density
  fontFamily:  FontFamily
  cardStyle:   CardStyle
  calmMode:    boolean
  displayMode: DisplayMode
}

const defaultSettings: UiSettings = {
  themeColor:  'cyan',
  fontColor:   'slate',
  fontSize:    16,
  cardRadius:  28,
  density:     20,
  fontFamily:  'Space Grotesk',
  cardStyle:   'glass',
  calmMode:    false,
  displayMode: 'dark',
}

const displayModeMap: Record<DisplayMode, {
  label:   string
  preview: string
  root:    string
  sidebar: string
  studio:  string
}> = {
  dark:     { label: 'Dark',     preview: '#020a14', root: '#020a14', sidebar: 'rgba(2,10,24,0.85)',      studio: '#040d1c' },
  midnight: { label: 'Midnight', preview: '#07051a', root: '#07051a', sidebar: 'rgba(7,5,26,0.88)',       studio: '#0b0822' },
  forest:   { label: 'Forest',   preview: '#021610', root: '#021610', sidebar: 'rgba(2,22,16,0.88)',      studio: '#041a14' },
  dim:      { label: 'Dim',      preview: '#111827', root: '#111827', sidebar: 'rgba(17,24,39,0.88)',     studio: '#192336' },
  light:    { label: 'Light',    preview: '#f1f5f9', root: '#f1f5f9', sidebar: 'rgba(248,250,252,0.95)', studio: '#ffffff' },
}

const themeMap: Record<ThemeColor, string> = {
  cyan:    '#22d3ee',
  violet:  '#8b5cf6',
  emerald: '#10b981',
  rose:    '#f43f5e',
  amber:   '#f59e0b',
}

const fontColorMap: Record<FontColor, string> = {
  slate:   '#dde8f5',
  white:   '#ffffff',
  cyan:    '#cffafe',
  emerald: '#d1fae5',
  rose:    '#ffe4e6',
}

const fontFamilyMap: Record<FontFamily, string> = {
  'Space Grotesk': '"Space Grotesk", system-ui, sans-serif',
  'Outfit':        'Outfit, system-ui, sans-serif',
  'Inter':         'Inter, system-ui, sans-serif',
  'Nunito':        'Nunito, system-ui, sans-serif',
  'Poppins':       'Poppins, system-ui, sans-serif',
  'Manrope':       'Manrope, system-ui, sans-serif',
}

const presets: Record<string, UiSettings> = {
  Ocean: {
    themeColor: 'cyan',    fontColor: 'slate',   fontSize: 16, cardRadius: 28, density: 20,
    fontFamily: 'Space Grotesk', cardStyle: 'glass',  calmMode: false, displayMode: 'dark',
  },
  Neon: {
    themeColor: 'violet',  fontColor: 'white',   fontSize: 16, cardRadius: 24, density: 20,
    fontFamily: 'Outfit',  cardStyle: 'glow',    calmMode: false, displayMode: 'midnight',
  },
  Forest: {
    themeColor: 'emerald', fontColor: 'emerald', fontSize: 16, cardRadius: 20, density: 20,
    fontFamily: 'Space Grotesk', cardStyle: 'soft',   calmMode: false, displayMode: 'forest',
  },
  Sunset: {
    themeColor: 'rose',    fontColor: 'rose',    fontSize: 18, cardRadius: 32, density: 28,
    fontFamily: 'Outfit',  cardStyle: 'glow',    calmMode: false, displayMode: 'dim',
  },
  Minimal: {
    themeColor: 'amber',   fontColor: 'white',   fontSize: 14, cardRadius: 16, density: 12,
    fontFamily: 'Inter',   cardStyle: 'sharp',   calmMode: false, displayMode: 'dark',
  },
}

function cardStyleClasses(cardStyle: CardStyle) {
  switch (cardStyle) {
    case 'soft':
      return 'bg-white/[0.04] border border-white/[0.08] shadow-xl'
    case 'sharp':
      return 'bg-[#060f1d] border border-white/[0.06] shadow-none'
    case 'glow':
      return 'bg-white/[0.05] border border-white/[0.1] shadow-[0_0_40px_rgba(255,255,255,0.04)]'
    case 'glass':
    default:
      return 'bg-white/[0.03] border border-white/[0.07] backdrop-blur-2xl shadow-2xl'
  }
}

function StudioSection({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle ? <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  )
}

function SwatchButton({
  label,
  active,
  onClick,
  preview,
}: {
  label: string
  active: boolean
  onClick: () => void
  preview?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'px-3 py-2 rounded-xl border text-sm transition-all flex items-center gap-2',
        active
          ? 'border-white/25 bg-white/12 text-white'
          : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white'
      )}
    >
      {preview}
      {label}
    </button>
  )
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-white">{label}</p>
        <span className="text-xs text-slate-400 tabular-nums">
          {value}{suffix}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-cyan-400"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function SettingsStudio({
  open,
  draft,
  activeTab,
  onTabChange,
  onClose,
  onApply,
  onCancel,
  onReset,
  onDraftChange,
  onApplyPreset,
}: {
  open: boolean
  draft: UiSettings
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  onClose: () => void
  onApply: () => void
  onCancel: () => void
  onReset: () => void
  onDraftChange: <K extends keyof UiSettings>(key: K, value: UiSettings[K]) => void
  onApplyPreset: (name: string) => void
}) {
  if (!open) return null

  const dmPreview = displayModeMap

  const tabs = [
    { key: 'theme'      as const, label: 'Theme',      icon: Palette    },
    { key: 'typography' as const, label: 'Typography', icon: Type       },
    { key: 'layout'     as const, label: 'Layout',     icon: LayoutGrid },
    { key: 'presets'    as const, label: 'Presets',    icon: Wand2      },
  ]

  const previewCardClass = cardStyleClasses(draft.cardStyle)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4">
      <div
        className="w-full max-w-6xl h-[86vh] rounded-[32px] border border-white/[0.08] shadow-2xl overflow-hidden flex"
        style={{ backgroundColor: displayModeMap[draft.displayMode ?? 'dark'].studio }}
      >

        <div className="w-64 shrink-0 border-r border-white/[0.06] bg-white/[0.02] p-5 flex flex-col">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">UI Studio</h2>
              <p className="text-xs text-slate-400 mt-1">Build your own VisionLab look.</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              aria-label="Close settings"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1 flex-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all',
                  activeTab === key
                    ? 'text-white bg-white/10 border border-white/15'
                    : 'text-slate-400 border border-transparent hover:bg-white/[0.05] hover:text-white'
                )}
              >
                <span className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1">Editing</p>
            <p className="text-sm font-semibold text-white capitalize">{activeTab}</p>
            <p className="text-xs text-slate-400 mt-1 leading-4">Edit then apply when ready.</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-auto p-6">
            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
              <div className="space-y-6">

                {activeTab === 'theme' && (
                  <>
                    <StudioSection title="Theme color" subtitle="Controls highlights, glows, and accent tone.">
                      <div className="flex flex-wrap gap-2">
                        {(['cyan', 'violet', 'emerald', 'rose', 'amber'] as ThemeColor[]).map((color) => (
                          <SwatchButton
                            key={color}
                            label={color}
                            active={draft.themeColor === color}
                            onClick={() => onDraftChange('themeColor', color)}
                            preview={
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: themeMap[color] }}
                              />
                            }
                          />
                        ))}
                      </div>
                    </StudioSection>

                    <StudioSection title="Font color" subtitle="How text feels across the interface.">
                      <div className="flex flex-wrap gap-2">
                        {(['slate', 'white', 'cyan', 'emerald', 'rose'] as FontColor[]).map((color) => (
                          <SwatchButton
                            key={color}
                            label={color}
                            active={draft.fontColor === color}
                            onClick={() => onDraftChange('fontColor', color)}
                            preview={
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: fontColorMap[color] }}
                              />
                            }
                          />
                        ))}
                      </div>
                    </StudioSection>

                    <StudioSection title="Card style" subtitle="Switch the surface personality.">
                      <div className="grid grid-cols-2 gap-3">
                        {(['glass', 'soft', 'sharp', 'glow'] as CardStyle[]).map((style) => (
                          <button
                            key={style}
                            type="button"
                            onClick={() => onDraftChange('cardStyle', style)}
                            className={clsx(
                              'rounded-2xl border p-4 text-left transition-all',
                              draft.cardStyle === style
                                ? 'border-white/25 bg-white/10'
                                : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'
                            )}
                          >
                            <p className="text-sm font-semibold text-white capitalize">{style}</p>
                            <p className="text-xs text-slate-400 mt-1">Preview this surface.</p>
                          </button>
                        ))}
                      </div>
                    </StudioSection>

                    <StudioSection title="Display mode" subtitle="Change the overall background atmosphere.">
                      <div className="grid grid-cols-2 gap-3">
                        {(Object.entries(dmPreview) as [DisplayMode, typeof dmPreview[DisplayMode]][]).map(([key, val]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => onDraftChange('displayMode', key)}
                            className={clsx(
                              'flex items-center gap-3 rounded-2xl border p-3 text-left transition-all',
                              draft.displayMode === key
                                ? 'border-white/25 bg-white/10'
                                : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]',
                            )}
                          >
                            <span
                              className="w-8 h-8 rounded-xl shrink-0 border border-white/10"
                              style={{ backgroundColor: val.preview }}
                            />
                            <div>
                              <p className="text-sm font-semibold text-white">{val.label}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{val.preview}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </StudioSection>
                  </>
                )}

                {activeTab === 'typography' && (
                  <>
                    <StudioSection title="Font family" subtitle="Shape the visual personality.">
                      <div className="grid grid-cols-2 gap-3">
                        {(['Space Grotesk', 'Outfit', 'Inter', 'Nunito', 'Poppins', 'Manrope'] as FontFamily[]).map((family) => (
                          <button
                            key={family}
                            type="button"
                            onClick={() => onDraftChange('fontFamily', family)}
                            className={clsx(
                              'rounded-2xl border p-4 text-left transition-all',
                              draft.fontFamily === family
                                ? 'border-white/25 bg-white/10'
                                : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]'
                            )}
                            style={{ fontFamily: fontFamilyMap[family] }}
                          >
                            <p className="text-base text-white font-medium">{family}</p>
                            <p className="text-xs text-slate-400 mt-1">Aa Bb Cc 123</p>
                          </button>
                        ))}
                      </div>
                    </StudioSection>

                    <StudioSection title="Font size" subtitle="Scale text across the workspace.">
                      <RangeControl
                        label="Base size"
                        value={draft.fontSize}
                        min={14}
                        max={20}
                        step={2}
                        suffix="px"
                        onChange={(v) => onDraftChange('fontSize', v as FontSize)}
                      />
                    </StudioSection>
                  </>
                )}

                {activeTab === 'layout' && (
                  <>
                    <StudioSection title="Card radius" subtitle="Sharper or softer corners.">
                      <RangeControl
                        label="Corner roundness"
                        value={draft.cardRadius}
                        min={16}
                        max={32}
                        step={4}
                        suffix="px"
                        onChange={(v) => onDraftChange('cardRadius', v as CardRadius)}
                      />
                    </StudioSection>

                    <StudioSection title="Spacing" subtitle="Control compactness and breathing room.">
                      <RangeControl
                        label="Content density"
                        value={draft.density}
                        min={12}
                        max={28}
                        step={8}
                        suffix="px"
                        onChange={(v) => onDraftChange('density', v as Density)}
                      />
                    </StudioSection>

                    <StudioSection title="Motion" subtitle="Reduce or disable all animations.">
                      <button
                        type="button"
                        onClick={() => onDraftChange('calmMode', !draft.calmMode)}
                        className={clsx(
                          'flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm transition-all w-full text-left',
                          draft.calmMode
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                            : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white',
                        )}
                      >
                        <span
                          className={clsx(
                            'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors',
                            draft.calmMode ? 'border-cyan-400 bg-cyan-500/40' : 'border-white/20 bg-white/[0.05]',
                          )}
                        >
                          <span
                            className={clsx(
                              'pointer-events-none absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                              draft.calmMode ? 'translate-x-4' : 'translate-x-0.5',
                            )}
                          />
                        </span>
                        <span>
                          <span className="font-medium block">Calm mode</span>
                          <span className="text-xs text-slate-400">Stops all animations and transitions</span>
                        </span>
                      </button>
                    </StudioSection>
                  </>
                )}

                {activeTab === 'presets' && (
                  <StudioSection title="Preset themes" subtitle="One-click styles for a premium feel.">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(presets).map(([name, preset]) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => onApplyPreset(name)}
                          className="rounded-2xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/12 p-4 text-left transition-all"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: themeMap[preset.themeColor] }}
                            />
                            <p className="text-sm font-semibold text-white">{name}</p>
                          </div>
                          <p className="text-xs text-slate-400">
                            {preset.fontFamily} · {preset.cardStyle} · {preset.fontSize}px
                          </p>
                        </button>
                      ))}
                    </div>
                  </StudioSection>
                )}

              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/[0.07] bg-white/[0.02] p-5 sticky top-0">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Live Preview</p>
                      <p className="text-xs text-slate-400 mt-0.5">See changes before applying.</p>
                    </div>
                    <span
                      className="w-2.5 h-2.5 rounded-full shadow-sm"
                      style={{ backgroundColor: themeMap[draft.themeColor], boxShadow: `0 0 10px ${themeMap[draft.themeColor]}80` }}
                    />
                  </div>

                  <div
                    className={previewCardClass}
                    style={{
                      borderRadius: `${draft.cardRadius}px`,
                      padding: `${draft.density}px`,
                      color: fontColorMap[draft.fontColor],
                      fontSize: `${draft.fontSize}px`,
                      fontFamily: fontFamilyMap[draft.fontFamily],
                      boxShadow:
                        draft.cardStyle === 'glow'
                          ? `0 0 0 1px ${themeMap[draft.themeColor]}20, 0 0 32px ${themeMap[draft.themeColor]}15`
                          : `0 0 0 1px ${themeMap[draft.themeColor]}15`,
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-white"
                        style={{ background: `linear-gradient(135deg, ${themeMap[draft.themeColor]}, #3b82f6, #a855f7)` }}
                      >
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">VisionLab</p>
                        <p className="text-xs text-slate-400">Your custom style</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div
                        className="border border-white/10 bg-white/[0.04]"
                        style={{
                          borderRadius: `${Math.max(12, draft.cardRadius - 8)}px`,
                          padding: `${Math.max(8, draft.density - 6)}px`,
                          fontSize: `${draft.fontSize - 1}px`,
                        }}
                      >
                        Dashboard card preview
                      </div>
                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-xl text-white text-sm font-medium"
                        style={{ backgroundColor: themeMap[draft.themeColor] }}
                      >
                        Accent button
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-500 leading-4">
                    Theme applies to the workspace shell and sidebar.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-6 py-4 flex items-center justify-between" style={{ backgroundColor: displayModeMap[draft.displayMode ?? 'dark'].root }}>
            <button
              type="button"
              onClick={onReset}
              className="px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white transition-all text-sm"
            >
              Reset defaults
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white transition-all text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onApply}
                className="px-5 py-2 rounded-xl text-slate-900 font-semibold text-sm transition-all hover:opacity-90"
                style={{ backgroundColor: themeMap[draft.themeColor] }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeTab, setActiveTab]       = useState<SettingsTab>('theme')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const [uiSettings, setUiSettings] = useState<UiSettings>(() => {
    try {
      const saved = localStorage.getItem('visionlab-ui-settings')
      // Merge with defaultSettings so any newly-added fields are always present
      const merged: UiSettings = saved
        ? { ...defaultSettings, ...(JSON.parse(saved) as Partial<UiSettings>) }
        : defaultSettings
      document.documentElement.classList.toggle('calm-mode', merged.calmMode)
      document.documentElement.classList.toggle('display-light', merged.displayMode === 'light')
      return merged
    } catch {
      return defaultSettings
    }
  })

  const [draftSettings, setDraftSettings] = useState<UiSettings>(uiSettings)

  useEffect(() => {
    localStorage.setItem('visionlab-ui-settings', JSON.stringify(uiSettings))
    document.documentElement.classList.toggle('calm-mode', uiSettings.calmMode)
    document.documentElement.classList.toggle('display-light', uiSettings.displayMode === 'light')
  }, [uiSettings])

  const handleLogout = () => { logout(); navigate('/login') }

  const openSettings = () => {
    setDraftSettings(uiSettings)
    setSettingsOpen(true)
  }

  const handleDraftChange = <K extends keyof UiSettings>(key: K, value: UiSettings[K]) => {
    setDraftSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleApplyPreset = (name: string) => { setDraftSettings(presets[name]) }
  const handleApply       = () => { setUiSettings(draftSettings); setSettingsOpen(false) }
  const handleCancel      = () => { setDraftSettings(uiSettings); setSettingsOpen(false) }

  const themeStyles = useMemo(
    () =>
      ({
        '--theme-accent':      themeMap[uiSettings.themeColor],
        '--theme-font':        fontColorMap[uiSettings.fontColor],
        '--theme-font-size':   `${uiSettings.fontSize}px`,
        '--theme-radius':      `${uiSettings.cardRadius}px`,
        '--theme-density':     `${uiSettings.density}px`,
        '--theme-font-family': fontFamilyMap[uiSettings.fontFamily],
      }) as React.CSSProperties,
    [uiSettings]
  )

  const shellCardClass = cardStyleClasses(uiSettings.cardStyle)
  const accent         = themeMap[uiSettings.themeColor]

  const dm = displayModeMap[uiSettings.displayMode] ?? displayModeMap.dark

  return (
    <div
      className="h-screen flex relative overflow-hidden"
      style={{
        ...themeStyles,
        backgroundColor: dm.root,
        color:           'var(--theme-font)',
        fontSize:        'var(--theme-font-size)',
        fontFamily:      'var(--theme-font-family)',
      }}
    >
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <SettingsStudio
        open={settingsOpen}
        draft={draftSettings}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={handleCancel}
        onApply={handleApply}
        onCancel={handleCancel}
        onReset={() => setDraftSettings(defaultSettings)}
        onDraftChange={handleDraftChange}
        onApplyPreset={handleApplyPreset}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="animate-aurora absolute -top-48 -left-48 w-[560px] h-[560px] rounded-full blur-[110px]"
          style={{ backgroundColor: `${accent}16` }}
        />
        <div className="animate-aurora-slow absolute top-1/4 -right-56 w-[640px] h-[640px] rounded-full bg-purple-600/[0.09] blur-[120px]" />
        <div className="animate-aurora-alt absolute -bottom-48 left-1/4 w-[520px] h-[520px] rounded-full bg-blue-600/[0.09] blur-[105px]" />
        <div className="animate-aurora absolute bottom-1/3 right-1/3 w-[360px] h-[360px] rounded-full bg-fuchsia-600/[0.07] blur-[90px]" />
      </div>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-72 shrink-0 border-r border-white/[0.06] flex flex-col shadow-2xl',
          'transition-transform duration-300 ease-in-out lg:static lg:z-10 lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
        style={{ background: dm.sidebar, backdropFilter: 'blur(40px) saturate(180%)', WebkitBackdropFilter: 'blur(40px) saturate(180%)' }}
      >
        <div className="px-5 py-5 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-3.5">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-2xl blur-xl animate-breathe"
                  style={{ backgroundColor: `${accent}50` }}
                />
                <div
                  className="relative w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${accent}, #3b82f6 55%, #a855f7)`,
                    boxShadow:  `0 4px 20px ${accent}45`,
                  }}
                >
                  <Eye className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-display font-bold text-white leading-tight tracking-tight text-[15px]">
                    VisionLab
                  </p>
                  <Sparkles className="w-3 h-3" aria-hidden="true" style={{ color: accent }} />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Smart Visual Analytics</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden w-11 h-11 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-3 pt-3">
          <div
            className={clsx('px-3 py-2.5 flex items-center gap-3', shellCardClass)}
            style={{ borderRadius: 'var(--theme-radius)' }}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: `linear-gradient(135deg, ${accent}, #8b5cf6)` }}
            >
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">{user?.username}</p>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">{user?.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Site navigation">
          <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.2em] text-slate-600 font-medium">
            Workspace
          </p>

          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-200 border',
                  isActive
                    ? 'text-white border-transparent'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                )
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      borderRadius: 'var(--theme-radius)',
                      background:   `linear-gradient(to right, ${accent}18, transparent)`,
                      boxShadow:    `inset 2.5px 0 0 ${accent}, 0 0 20px ${accent}0e`,
                      borderColor:  `${accent}22`,
                    }
                  : { borderRadius: 'var(--theme-radius)' }
              }
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.06] group-hover:bg-white/[0.09] transition-colors shrink-0">
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}

          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-200 border',
                  isActive
                    ? 'text-white border-transparent'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                )
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      borderRadius: 'var(--theme-radius)',
                      background:   'linear-gradient(to right, rgba(168,85,247,0.16), transparent)',
                      boxShadow:    'inset 2.5px 0 0 #a855f7, 0 0 20px rgba(168,85,247,0.08)',
                      borderColor:  'rgba(168,85,247,0.2)',
                    }
                  : { borderRadius: 'var(--theme-radius)' }
              }
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.06] group-hover:bg-white/[0.09] transition-colors shrink-0">
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              </span>
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        <div className="px-3 pb-4 pt-2 border-t border-white/[0.06] space-y-1">
          <button
            onClick={openSettings}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-400 border border-transparent hover:text-slate-200 hover:bg-white/[0.04] hover:border-white/[0.06] transition-all"
            style={{ borderRadius: 'var(--theme-radius)' }}
            aria-label="Open UI settings"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.05] shrink-0">
              <Settings className="w-4 h-4" aria-hidden="true" />
            </span>
            UI Settings
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-rose-400/80 border border-transparent hover:text-rose-300 hover:bg-rose-500/[0.08] hover:border-rose-400/10 transition-all"
            style={{ borderRadius: 'var(--theme-radius)' }}
            aria-label="Log out"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-rose-500/[0.08] shrink-0">
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </span>
            Log Out
          </button>
        </div>
      </aside>

      <main id="main-content" className="relative z-10 flex-1 min-w-0 overflow-hidden flex flex-col" tabIndex={-1}>
        <div
          className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] shrink-0"
          style={{ background: dm.sidebar, backdropFilter: 'blur(40px) saturate(180%)', WebkitBackdropFilter: 'blur(40px) saturate(180%)' }}
        >
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="w-11 h-11 -ml-1 rounded-2xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${accent}, #3b82f6 55%, #a855f7)` }}
            >
              <Eye className="w-4 h-4 text-white" aria-hidden="true" />
            </div>
            <p className="font-display font-bold text-white text-sm truncate">VisionLab</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
