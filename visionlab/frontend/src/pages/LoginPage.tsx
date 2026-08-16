import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowUpRight } from 'lucide-react'
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-paper">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="text-center mb-9">
          <Eye className="w-6 h-6 text-ink mx-auto mb-4" aria-hidden="true" />
          <h1 className="font-display text-3xl font-medium text-ink tracking-tight">VisionLab</h1>
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mt-2">
            Smart Visual Analytics
          </p>
        </div>

        <div className="rounded-lg border border-line bg-paper-raised shadow-card p-8 md:p-9">
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mb-2">
            Sign in
          </p>
          <h2 className="font-display text-2xl font-medium text-ink tracking-tight leading-tight">
            Welcome back
          </h2>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-[11px] font-mono uppercase tracking-[0.14em] text-ink-faint mb-2"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full rounded border border-line-strong bg-paper-raised px-4 py-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-ink"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[11px] font-mono uppercase tracking-[0.14em] text-ink-faint mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded border border-line-strong bg-paper-raised px-4 py-3 pr-11 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-ink-faint hover:text-ink transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in…' : 'Continue'}
              {!loading && <ArrowUpRight className="w-4 h-4" aria-hidden="true" />}
            </button>
          </form>

          <div className="mt-7 pt-5 border-t border-line text-center">
            <p className="text-sm text-ink-muted">
              New here?{' '}
              <Link to="/register" className="font-semibold text-ink underline underline-offset-2">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
