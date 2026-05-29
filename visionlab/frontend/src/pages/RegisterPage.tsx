import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { getApiErrorMessage } from '../services/api'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.password !== form.confirm) {
      toast.error('Passwords do not match.')
      return
    }

    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      await register(form.username, form.email, form.password)
      toast.success('Account created! Welcome to VisionLab.')
      navigate('/dashboard')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Registration failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-10 bg-[#07111f]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/4 -right-16 w-80 h-80 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute -bottom-16 left-1/3 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center mb-5">
            <div className="absolute inset-0 rounded-3xl bg-cyan-400/25 blur-xl" />
            <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-cyan-400 via-blue-500 to-fuchsia-500 shadow-2xl">
              <Eye className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <h1 className="font-display text-3xl font-bold text-white">VisionLab</h1>
            <Sparkles className="w-4 h-4 text-cyan-300" aria-hidden="true" />
          </div>
          <p className="text-slate-400 mt-2">Create your account</p>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] backdrop-blur-2xl shadow-2xl p-7 md:p-8">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/80 mb-2">
              Join VisionLab
            </p>
            <h2 className="text-2xl font-semibold text-white">Create your account</h2>
            <p className="text-sm text-slate-400 mt-1">
              Start your visual AI learning experience in a modern workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {[
              { name: 'username', label: 'Username', type: 'text', placeholder: 'Choose a username' },
              { name: 'email', label: 'Email address', type: 'email', placeholder: 'you@example.com' },
              { name: 'password', label: 'Password', type: 'password', placeholder: 'At least 8 characters' },
              { name: 'confirm', label: 'Confirm password', type: 'password', placeholder: 'Repeat your password' },
            ].map(({ name, label, type, placeholder }) => (
              <div key={name}>
                <label htmlFor={name} className="block text-sm font-medium text-slate-200 mb-1.5">
                  {label}
                </label>
                <input
                  id={name}
                  name={name}
                  type={type}
                  required
                  value={form[name as keyof typeof form]}
                  onChange={handleChange}
                  placeholder={placeholder}
                  className="w-full px-4 py-3 rounded-2xl border border-white/10 bg-white/5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10 text-center">
            <p className="text-sm text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-cyan-300 hover:text-cyan-200 transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}