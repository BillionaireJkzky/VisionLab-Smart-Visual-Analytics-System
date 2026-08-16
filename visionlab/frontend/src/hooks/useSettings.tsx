// VisionLab – UI customisation settings context (theme/accent/typography/
// density/shape/accessibility). Mirrors useAuth.tsx's shape: a provider that
// hydrates from a fast local source first, then reconciles with the backend
// once the user is known.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { authApi, getApiErrorMessage } from '../services/api'
import { useAuth } from './useAuth'
import type { UiSettings } from '../types/api'

const STORAGE_KEY = 'visionlab-settings'
const SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: Required<Omit<UiSettings, '_v'>> = {
  mode: 'light',
  accent: 'mono',
  typography: 'editorial',
  font_size: 16,
  reading_comfort: 'normal',
  density: 'comfortable',
  sidebar: 'expanded',
  content_width: 'wide',
  radius: 'rounded',
  separation: 'border',
  reduce_motion: false,
  high_contrast: false,
  underline_links: false,
}

const ACCENT_CLASSES: Record<string, string> = {
  clay: 'accent-clay',
  taupe: 'accent-taupe',
  ochre: 'accent-ochre',
  plum: 'accent-plum',
  charcoal: 'accent-charcoal',
}

function readStoredSettings(): UiSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UiSettings) : null
  } catch {
    return null
  }
}

function writeStoredSettings(settings: UiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage full/unavailable — settings still work for this session via DOM state.
  }
}

function prefersDarkOS(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveIsDark(settings: UiSettings): boolean {
  if (settings.mode === 'dark') return true
  if (settings.mode === 'system') return prefersDarkOS()
  return false
}

/** Apply a settings object to <html> — the single place that owns document.documentElement's class list. */
function applySettingsToDom(settings: UiSettings): void {
  const merged = { ...DEFAULT_SETTINGS, ...settings }
  const classes: string[] = []

  // Density/sidebar/content-width are intentionally NOT set here — they're
  // read directly from useSettings() by Layout.tsx/Card.tsx/SurfaceCard.tsx,
  // since Tailwind's spacing utilities can't be overridden by a CSS class
  // (see the comment in index.css). Everything below IS a pure CSS-var/class
  // toggle, so document.documentElement is the right place for it.
  if (resolveIsDark(merged)) classes.push('dark')
  if (merged.accent !== 'mono' && ACCENT_CLASSES[merged.accent]) classes.push(ACCENT_CLASSES[merged.accent])
  if (merged.typography === 'clean') classes.push('font-clean')
  if (merged.radius === 'sharp') classes.push('radius-sharp')
  if (merged.reduce_motion) classes.push('calm-mode')
  if (merged.underline_links) classes.push('underline-links')
  // High contrast last so it wins the cascade over dark/accent (see index.css).
  if (merged.high_contrast) classes.push('high-contrast')

  document.documentElement.className = classes.join(' ')
  document.documentElement.style.fontSize = `${(merged.font_size / 16) * 100}%`
  document.documentElement.dataset.readingComfort = merged.reading_comfort
}

function hasBeenExplicitlySaved(settings: UiSettings | null | undefined): boolean {
  return !!settings && typeof settings._v === 'number'
}

interface SettingsContextValue {
  committed: UiSettings
  draft: UiSettings
  isSaving: boolean
  updateDraft: (patch: Partial<UiSettings>) => void
  applyDraft: () => Promise<void>
  cancelDraft: () => void
  resetDraft: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const reconciledForUser = useRef<string | null>(null)

  const [committed, setCommitted] = useState<UiSettings>(() => {
    const stored = readStoredSettings()
    const initial = stored ?? {}
    applySettingsToDom(initial)
    return initial
  })
  const [draft, setDraft] = useState<UiSettings>(committed)
  const [isSaving, setIsSaving] = useState(false)

  // Re-resolve "system" appearance live if the OS preference changes.
  useEffect(() => {
    if (committed.mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => applySettingsToDom(committed)
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [committed])

  // Reconcile local vs backend settings once the user resolves (once per user).
  useEffect(() => {
    if (!user || reconciledForUser.current === user.id) return
    reconciledForUser.current = user.id

    const local = readStoredSettings()

    if (hasBeenExplicitlySaved(user.settings)) {
      // Backend wins — e.g. this is a different device than where settings were set.
      setCommitted(user.settings)
      setDraft(user.settings)
      writeStoredSettings(user.settings)
      applySettingsToDom(user.settings)
    } else if (hasBeenExplicitlySaved(local)) {
      // This browser has saved prefs the backend has never seen — adopt them.
      const withVersion = { ...local, _v: SCHEMA_VERSION }
      setCommitted(withVersion)
      setDraft(withVersion)
      authApi.updateSettings(withVersion).catch(() => {
        // Best-effort — settings still work locally even if the sync fails.
      })
    }
  }, [user])

  const updateDraft = useCallback((patch: Partial<UiSettings>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch }
      applySettingsToDom(next)
      return next
    })
  }, [])

  const cancelDraft = useCallback(() => {
    setDraft(committed)
    applySettingsToDom(committed)
  }, [committed])

  const resetDraft = useCallback(() => {
    const next: UiSettings = { ...DEFAULT_SETTINGS }
    setDraft(next)
    applySettingsToDom(next)
  }, [])

  const applyDraft = useCallback(async () => {
    const next = { ...draft, _v: SCHEMA_VERSION }
    setCommitted(next)
    setDraft(next)
    writeStoredSettings(next)
    applySettingsToDom(next)

    setIsSaving(true)
    try {
      await authApi.updateSettings(next)
    } catch (error) {
      // Local state is already the source of truth for this session; surface
      // a soft failure rather than blocking the user's chosen preferences.
      console.warn('Failed to sync settings to server:', getApiErrorMessage(error, 'Unknown error'))
    } finally {
      setIsSaving(false)
    }
  }, [draft])

  return (
    <SettingsContext.Provider value={{ committed, draft, isSaving, updateDraft, applyDraft, cancelDraft, resetDraft }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
