import { Component, type ErrorInfo, type ReactNode } from 'react'

type GlobalErrorBoundaryProps = {
  children: ReactNode
}

type GlobalErrorBoundaryState = {
  hasError: boolean
}

export default class GlobalErrorBoundary extends Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  constructor(props: GlobalErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): GlobalErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Why this and not only console.error: preserving the app shell with a user-safe fallback
    // improves resilience for ASD/ELL users compared with a full blank-screen crash.
    console.error('GlobalErrorBoundary caught an error:', error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="min-h-screen bg-[#07111f] text-slate-100 flex items-center justify-center p-6">
        <section
          className="w-full max-w-xl border border-white/10 bg-white/[0.05] backdrop-blur-xl rounded-3xl shadow-2xl p-6 md:p-8"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-300 mb-3">VisionLab recovery mode</p>
          <h1 className="text-2xl font-semibold text-white">Something went wrong on this page.</h1>
          <p className="mt-3 text-slate-300 leading-7">
            The app hit an unexpected error. Your data is still safe. Please reload and try again.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-semibold hover:bg-cyan-300 transition-colors"
          >
            Reload app
          </button>
        </section>
      </main>
    )
  }
}
