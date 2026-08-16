import { Link } from 'react-router-dom'
import {
  Upload,
  BookOpen,
  History,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="max-w-5xl mx-auto space-y-20">

      {/* ── Header — plain, functional ──────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 pb-10 border-b border-line">
        <div className="max-w-xl">
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mb-4">
            Dashboard
          </p>
          <h1 className="font-display text-4xl md:text-[44px] font-medium text-ink leading-[1.1]">
            Welcome back, {user?.username}
          </h1>
          <p className="mt-5 text-ink-muted leading-7 max-w-md">
            Upload an image to run detection, emotion recognition, text extraction, scene
            description, story generation, narration, and a vocabulary quiz — one pipeline,
            seven steps.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <Link to="/analyse" className="btn-primary">
            <Upload className="w-4 h-4" aria-hidden="true" />
            Analyse an image
          </Link>
          <Link to="/history" className="btn-secondary">
            <History className="w-4 h-4" aria-hidden="true" />
            View history
          </Link>
        </div>
      </header>

      {/* ── Core actions — asymmetric: one large primary + two stacked ── */}
      <section>
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mb-6">
          Core actions
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Link
            to="/analyse"
            className="group lg:col-span-2 lg:row-span-2 rounded-lg border border-line bg-paper-raised p-10 shadow-card
                       hover:border-ink-faint transition-colors duration-150 flex flex-col justify-between min-h-[300px]"
          >
            <div className="flex items-start justify-between gap-4">
              <Upload className="w-5 h-5 text-ink" aria-hidden="true" />
              <ArrowRight className="w-4 h-4 text-ink-faint opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-medium text-ink mb-3">
                Analyse an image
              </h2>
              <p className="text-sm leading-6 text-ink-muted max-w-sm">
                Upload a photo and run all seven pipeline steps — detection, emotion, text,
                scene, story, narration, and quiz.
              </p>
            </div>
          </Link>

          <Link
            to="/progress"
            className="group rounded-lg border border-line bg-paper-raised p-7 shadow-card
                       hover:border-ink-faint transition-colors duration-150 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-4">
              <BookOpen className="w-4 h-4 text-ink" aria-hidden="true" />
              <ArrowRight className="w-3.5 h-3.5 text-ink-faint opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink mb-1.5">Vocabulary progress</h3>
              <p className="text-sm leading-6 text-ink-muted">
                Spaced-repetition review of words learned from your images.
              </p>
            </div>
          </Link>

          <Link
            to="/history"
            className="group rounded-lg border border-line bg-paper-raised p-7 shadow-card
                       hover:border-ink-faint transition-colors duration-150 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-4">
              <History className="w-4 h-4 text-ink" aria-hidden="true" />
              <ArrowRight className="w-3.5 h-3.5 text-ink-faint opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink mb-1.5">Analysis history</h3>
              <p className="text-sm leading-6 text-ink-muted">
                Every past analysis — results, audio, and quiz attempts.
              </p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  )
}
