import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Fingerprint, ArrowUpRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { getApiErrorMessage } from '../services/api'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focusField, setFocusField] = useState<'username' | 'password' | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Sign in failed. Please check your details and try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-10 bg-[#04060d] text-white">
      <style>{`
        @keyframes vl-drift { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(20px,-30px,0) scale(1.08); } }
        @keyframes vl-pulse-ring { 0% { transform: scale(0.85); opacity: 0.55; } 100% { transform: scale(1.6); opacity: 0; } }
        @keyframes vl-grain { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-3%,2%); } 50% { transform: translate(2%,-3%); } 75% { transform: translate(-2%,-2%); } }
        @keyframes vl-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes vl-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .vl-rise { animation: vl-rise 0.7s cubic-bezier(.2,.7,.2,1) both; }
        .vl-stagger > * { opacity: 0; animation: vl-rise 0.65s cubic-bezier(.2,.7,.2,1) forwards; }
        .vl-stagger > *:nth-child(1) { animation-delay: 0.05s; }
        .vl-stagger > *:nth-child(2) { animation-delay: 0.12s; }
        .vl-stagger > *:nth-child(3) { animation-delay: 0.19s; }
        .vl-stagger > *:nth-child(4) { animation-delay: 0.26s; }
        .vl-stagger > *:nth-child(5) { animation-delay: 0.33s; }
        .vl-shimmer-text { background: linear-gradient(110deg, #e2e8f0 30%, #67e8f9 50%, #e2e8f0 70%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: vl-shimmer 6s linear infinite; }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full blur-[120px] opacity-50"
          style={{ background: 'radial-gradient(circle at 30% 30%, oklch(0.78 0.18 200), transparent 65%)', animation: 'vl-drift 18s ease-in-out infinite' }}
        />
        <div
          className="absolute top-1/3 -right-32 w-[32rem] h-[32rem] rounded-full blur-[140px] opacity-45"
          style={{ background: 'radial-gradient(circle at 60% 40%, oklch(0.72 0.22 320), transparent 65%)', animation: 'vl-drift 22s ease-in-out infinite reverse' }}
        />
        
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" aria-hidden="true">
          <defs>
            <pattern id="vl-grid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M 56 0 L 0 0 0 56" fill="none" stroke="white" strokeWidth="0.4" />
            </pattern>
            <radialGradient id="vl-fade" cx="50%" cy="50%"><stop offset="0%" stopColor="white" stopOpacity="1" /><stop offset="100%" stopColor="white" stopOpacity="0" /></radialGradient>
            <mask id="vl-grid-mask"><rect width="100%" height="100%" fill="url(#vl-fade)" /></mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#vl-grid)" mask="url(#vl-grid-mask)" />
        </svg>

        <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>")',
            animation: 'vl-grain 8s steps(8) infinite',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-[440px] vl-rise">
        <div className="text-center mb-9">
          <div className="relative inline-flex items-center justify-center mb-6">
            <span className="absolute w-20 h-20 rounded-full border border-cyan-300/40" style={{ animation: 'vl-pulse-ring 2.6s ease-out infinite' }} />
            <div className="relative w-[68px] h-[68px] rounded-[22px] flex items-center justify-center shadow-[0_20px_60px_-15px_rgba(34,211,238,0.55)]"
              style={{ background: 'conic-gradient(from 220deg at 50% 50%, oklch(0.78 0.18 200), oklch(0.72 0.22 320), oklch(0.65 0.2 260), oklch(0.78 0.18 200))' }}>
              <div className="absolute inset-[2px] rounded-[20px] bg-[#04060d]/85 backdrop-blur-xl flex items-center justify-center">
                <Fingerprint className="w-7 h-7 text-cyan-200" strokeWidth={1.5} />
              </div>
            </div>
          </div>
          <h1 className="text-[34px] font-bold tracking-[-0.04em] vl-shimmer-text leading-none">VisionLab</h1>
          <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/60 mt-3 font-medium">Smart Visual Analytics · v36</p>
        </div>

        <div className="relative rounded-[28px] overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(24px) saturate(160%)',
          }}>
          
          <div className="p-8 md:p-9 vl-stagger">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/70 mb-2 font-semibold">⟢ Sign in</p>
              <h2 className="text-[26px] font-semibold text-white tracking-tight leading-tight">
                Welcome back.
                <br />
                Sign in to continue.
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2 font-semibold"
                >
                  Username
                </label>
                <div className="relative rounded-2xl transition-all duration-300"
                  style={{
                    background: focusField === 'username' ? 'rgba(34,211,238,0.10)' : 'rgba(255,255,255,0.03)',
                    border: focusField === 'username' ? '1px solid rgba(103,232,249,0.45)' : '1px solid rgba(255,255,255,0.08)',
                  }}>
                  <input
                    id="login-username"
                    type="text"
                    required
                    value={username}
                    onFocus={() => setFocusField('username')}
                    onBlur={() => setFocusField(null)}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full bg-transparent px-4 py-3.5 text-[15px] text-white placeholder:text-slate-600 outline-none rounded-2xl"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2 font-semibold"
                >
                  Password
                </label>
                <div className="relative rounded-2xl transition-all duration-300"
                  style={{
                    background: focusField === 'password' ? 'rgba(34,211,238,0.10)' : 'rgba(255,255,255,0.03)',
                    border: focusField === 'password' ? '1px solid rgba(103,232,249,0.45)' : '1px solid rgba(255,255,255,0.08)',
                  }}>
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    required
                    value={password}
                    onFocus={() => setFocusField('password')}
                    onBlur={() => setFocusField(null)}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-transparent px-4 py-3.5 pr-12 text-[15px] text-white placeholder:text-slate-600 outline-none rounded-2xl tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full mt-3 rounded-2xl overflow-hidden py-3.5 text-[15px] font-semibold text-[#04060d] transition-all"
                style={{ background: 'linear-gradient(120deg, oklch(0.78 0.18 200), oklch(0.72 0.22 320))' }}>
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? 'Signing in...' : 'Continue'}
                  {!loading && <ArrowUpRight className="w-4 h-4" />}
                </span>
              </button>
            </form>

            <div className="mt-7 pt-5 border-t border-white/[0.06] text-center">
              <p className="text-sm text-slate-400">
                New here?{' '}
                <Link to="/register" className="font-semibold text-cyan-300">
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}