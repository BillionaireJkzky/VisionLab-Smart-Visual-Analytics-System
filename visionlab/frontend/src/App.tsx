import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'

// Eagerly loaded — needed immediately on any route
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

// Lazy loaded — deferred until the route is visited
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const AnalysisPage  = lazy(() => import('./pages/AnalysisPage'))
const ResultPage    = lazy(() => import('./pages/ResultPage'))
const HistoryPage   = lazy(() => import('./pages/HistoryPage'))
const ProgressPage  = lazy(() => import('./pages/ProgressPage'))
const AdminPage     = lazy(() => import('./pages/AdminPage'))

function PageLoader() {
  return (
    <div
      className="flex flex-col items-center justify-center h-full min-h-[400px] gap-3 text-slate-400"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
      <span className="text-sm">Loading...</span>
    </div>
  )
}

function RouteLoadingState() {
  return (
    <div
      className="flex items-center justify-center h-screen text-slate-300"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      Loading your workspace...
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <RouteLoadingState />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <RouteLoadingState />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route
          path="dashboard"
          element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>}
        />
        <Route
          path="analyse"
          element={<Suspense fallback={<PageLoader />}><AnalysisPage /></Suspense>}
        />
        <Route
          path="result/:taskId"
          element={<Suspense fallback={<PageLoader />}><ResultPage /></Suspense>}
        />
        <Route
          path="history"
          element={<Suspense fallback={<PageLoader />}><HistoryPage /></Suspense>}
        />
        <Route
          path="progress"
          element={<Suspense fallback={<PageLoader />}><ProgressPage /></Suspense>}
        />
        <Route
          path="admin"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}><AdminPage /></Suspense>
            </AdminRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
