import { Link } from 'react-router-dom'
import {
  Upload,
  BookOpen,
  History,
  Sparkles,
  ArrowRight,
  Eye,
  Smile,
  ScanText,
  AudioLines,
  GraduationCap,
  Layers,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const features = [
  {
    icon: Upload,
    title: 'Analyse an Image',
    description:
      'Upload any photo to detect objects, recognise emotions, extract text, enrich the scene with AI descriptions, and generate personalised stories.',
    to: '/analyse',
    accent: 'from-cyan-500/20 to-blue-500/10',
    iconWrap: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/20',
  },
  {
    icon: BookOpen,
    title: 'Vocabulary Progress',
    description:
      'Track your English vocabulary growth with spaced repetition. Words you learn from images stay with you longer.',
    to: '/progress',
    accent: 'from-emerald-500/20 to-teal-500/10',
    iconWrap: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
  },
  {
    icon: History,
    title: 'Analysis History',
    description:
      'Revisit every image you have analysed. Browse results, replay audio, and re-attempt quizzes from past sessions.',
    to: '/history',
    accent: 'from-fuchsia-500/20 to-violet-500/10',
    iconWrap: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/20',
  },
]

const capabilities = [
  { icon: Layers,       label: 'Object Detection',   desc: 'YOLO + RT-DETR with location & confidence' },
  { icon: Smile,        label: 'Emotion Recognition', desc: 'DeepFace reads real facial emotions' },
  { icon: ScanText,     label: 'Text Extraction',     desc: 'EasyOCR + automatic translation' },
  { icon: Eye,          label: 'Scene Understanding', desc: 'Vision model + Gemini enrichment' },
  { icon: Sparkles,     label: 'Story Generation',    desc: 'Gemini writes vivid 150-word stories' },
  { icon: AudioLines,   label: 'Audio Narration',     desc: 'gTTS narrates the full analysis' },
  { icon: GraduationCap, label: 'Vocabulary Quiz',   desc: 'SM-2 spaced repetition learning' },
]

const steps = [
  { step: '1', title: 'Upload an image', text: 'Go to Analyse Image and upload a JPG, PNG, WEBP, or BMP file up to 10 MB.' },
  { step: '2', title: 'Choose your settings', text: 'Select detection model, emotion mode, scene model, story type, and quiz difficulty.' },
  { step: '3', title: 'Watch the pipeline', text: 'Follow each AI step in real time — detection, emotion, OCR, scene, story, audio, quiz.' },
  { step: '4', title: 'Explore and learn', text: 'Review results, listen to the narration, read your personalised story, and take the quiz.' },
]

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="max-w-6xl mx-auto animate-fade-in space-y-8">

      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-cyan-500/10 via-blue-500/8 to-fuchsia-500/10 p-8 md:p-10 shadow-2xl">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 right-0 w-80 h-80 rounded-full bg-cyan-400/12 blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-72 h-72 rounded-full bg-fuchsia-500/12 blur-3xl" />
          <div className="absolute top-1/2 left-0 w-48 h-48 rounded-full bg-blue-500/8 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200 mb-5">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              VisionLab AI Workspace
            </div>

            <h1 className="font-display text-3xl md:text-4xl font-bold text-white leading-tight">
              Welcome back,{' '}
              <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
                {user?.username}
              </span>
            </h1>

            <p className="mt-4 text-slate-300 leading-7 max-w-xl">
              Upload any image and watch 7 AI models work in parallel — detecting every object,
              reading faces, extracting text, describing the scene, writing a personalised story,
              narrating it aloud, and building a vocabulary quiz.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/analyse" className="btn-primary">
                <Upload className="w-4 h-4" aria-hidden="true" />
                Start Analysis
              </Link>
              <Link to="/history" className="btn-secondary">
                <History className="w-4 h-4" aria-hidden="true" />
                View History
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 min-w-[260px]">
            {capabilities.slice(0, 4).map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl px-4 py-3 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">{label}</p>
                  <p className="text-[11px] text-slate-400 leading-4 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80 mb-1">Core tools</p>
          <h2 className="text-2xl font-semibold text-white">Choose your next action</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, description, to, accent, iconWrap }) => (
            <Link
              key={to}
              to={to}
              className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-cyan-500/5"
            >
              <div className={`absolute inset-0 opacity-80 bg-gradient-to-br ${accent}`} />
              <div className="relative z-10">
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center mb-5 ${iconWrap}`}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white group-hover:text-cyan-200 transition-colors">
                    {title}
                  </h3>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-7">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80 mb-1">What's inside</p>
          <h2 className="text-2xl font-semibold text-white">7 AI models. One pipeline.</h2>
          <p className="text-sm text-slate-400 mt-1">All running automatically the moment you upload an image.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {capabilities.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-cyan-300" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-slate-400 mt-1 leading-5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-7">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80 mb-1">Guide</p>
          <h2 className="text-2xl font-semibold text-white">How it works</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {steps.map((item) => (
            <div key={item.step} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-cyan-500/15 border border-cyan-400/20 text-cyan-300 text-sm font-bold flex items-center justify-center shrink-0">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{item.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
