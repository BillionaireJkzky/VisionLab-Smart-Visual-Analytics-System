import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye } from 'lucide-react'
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-paper">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <Eye className="w-6 h-6 text-ink mx-auto mb-4" aria-hidden="true" />
          <h1 className="font-display text-3xl font-medium text-ink tracking-tight">VisionLab</h1>
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mt-2">
            Smart Visual Analytics
          </p>
        </div>

        <div className="rounded-lg border border-line bg-paper-raised shadow-card p-7 md:p-8">
          <div className="mb-6">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mb-2">
              Join VisionLab
            </p>
            <h2 className="font-display text-2xl font-medium text-ink tracking-tight">Create your account</h2>
            <p className="text-sm text-ink-muted mt-1">
              Start your visual AI learning experience.
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
                <label htmlFor={name} className="block text-[11px] font-mono uppercase tracking-[0.14em] text-ink-faint mb-2">
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
                  className="w-full rounded border border-line-strong bg-paper-raised px-4 py-3 text-sm text-ink placeholder:text-ink-faint outline-none transition-colors focus:border-ink"
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-line text-center">
            <p className="text-sm text-ink-muted">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-ink underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
