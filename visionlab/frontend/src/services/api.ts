// VisionLab – Axios API client

import axios from 'axios'
import { AxiosHeaders, isAxiosError } from 'axios'
import type {
  AdminAnalyticsResponse,
  AnalysisResult,
  AnalysisUploadOptions,
  HealthCheckResponse,
  QuizSubmissionResponse,
  ReviewWordResponse,
  TaskStatusResponse,
  TokenResponse,
  UiSettings,
  UserOut,
  VocabularyProgressResponse,
} from '../types/api'

const BASE_URL = '/api/v1'
export const TOKEN_KEY = 'visionlab_token'

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers =
    config.headers instanceof AxiosHeaders ? config.headers : new AxiosHeaders(config.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  config.headers = headers
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    // On 401 from any non-auth endpoint while a token is stored, the token has
    // expired. Notify AuthProvider to clear state without a hard page reload.
    if (
      isAxiosError(error) &&
      error.response?.status === 401 &&
      localStorage.getItem(TOKEN_KEY) &&
      !error.config?.url?.includes('/auth/login')
    ) {
      window.dispatchEvent(new CustomEvent('visionlab:auth-expired'))
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  register: (username: string, email: string, password: string) =>
    client.post<UserOut>('/auth/register', { username, email, password }),

  login: async (username: string, password: string) => {
    const res = await client.post<TokenResponse>('/auth/login', { username, password })
    if (res.data?.access_token) {
      localStorage.setItem(TOKEN_KEY, res.data.access_token)
    }
    return res
  },

  me: () => client.get<UserOut>('/auth/me'),

  updateSettings: (settings: UiSettings) =>
    client.put<UserOut>('/auth/settings', settings, { timeout: 10000 }),

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
  },
}

export const analysisApi = {
  upload: (file: File, options: AnalysisUploadOptions = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('emotion_mode', options.emotion_mode ?? 'standard')
    formData.append('story_type', options.story_type ?? 'fun_adventure')
    formData.append('difficulty', options.difficulty ?? 'beginner')
    formData.append('output_language', options.output_language ?? 'en')
    formData.append('detector_model', options.detector_model ?? 'balanced')
    formData.append('scene_model', options.scene_model ?? 'git')

    return client.post<TaskStatusResponse>('/analysis/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
  },

  getStatus: (taskId: string) =>
    client.get<TaskStatusResponse>(`/analysis/tasks/${taskId}`, { timeout: 10000 }),

  getResult: (taskId: string) =>
    client.get<AnalysisResult>(`/analysis/result/${taskId}`, { timeout: 15000 }),

  getHistory: (limit = 20, offset = 0) =>
    client.get<TaskStatusResponse[]>('/analysis/history', {
      params: { limit, offset },
      timeout: 15000,
    }),

  cancelTask: (taskId: string) =>
    client.post(`/analysis/tasks/${taskId}/cancel`, undefined, { timeout: 10000 }),

  deleteTask: (taskId: string) =>
    client.delete(`/analysis/tasks/${taskId}`, { timeout: 10000 }),
}

export const vocabularyApi = {
  getProgress: (userId: string) =>
    client.get<VocabularyProgressResponse>(`/vocabulary/progress/${userId}`),

  getReview: (userId: string) =>
    client.get<ReviewWordResponse>(`/vocabulary/review/${userId}`),

  submitQuiz: (word: string, userAnswer: string, correctAnswer: string, taskId?: string, responseTimeMs?: number) =>
    client.post<QuizSubmissionResponse>('/vocabulary/quiz/submit', {
      word,
      user_answer: userAnswer,
      correct_answer: correctAnswer,
      task_id: taskId ?? null,
      response_time_ms: responseTimeMs ?? null,
    }),
}

export const adminApi = {
  getAnalytics: () => client.get<AdminAnalyticsResponse>('/admin/analytics'),

  getUsers: (limit = 50, offset = 0) =>
    client.get<UserOut[]>('/admin/users', { params: { limit, offset } }),
}

export const healthApi = {
  check: () =>
    axios.get<HealthCheckResponse>('/health', { timeout: 5000 }),
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError(error)) return fallback

  const status = error.response?.status

  if (status === 429) {
    const retryAfter = error.response?.headers?.['retry-after']
    return retryAfter
      ? `Too many requests. Please wait ${retryAfter}s before trying again.`
      : 'Too many requests. Please slow down and try again.'
  }

  const payload = error.response?.data
  if (typeof payload === 'string' && payload.trim()) return payload

  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
  }

  if (error.message?.trim()) return error.message
  return fallback
}

export { client }
