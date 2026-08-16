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
      <main className="min-h-screen bg-paper text-ink flex items-center justify-center p-6">
        <section
          className="w-full max-w-xl border border-line rounded-lg bg-paper-raised shadow-card p-6 md:p-8"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-ink-faint mb-3">VisionLab recovery mode</p>
          <h1 className="font-display text-2xl font-medium text-ink">Something went wrong on this page.</h1>
          <p className="mt-3 text-ink-muted leading-7">
            The app hit an unexpected error. Your data is still safe. Please reload and try again.
          </p>
          <button type="button" onClick={this.handleReload} className="btn-primary mt-6">
            Reload app
          </button>
        </section>
      </main>
    )
  }
}
