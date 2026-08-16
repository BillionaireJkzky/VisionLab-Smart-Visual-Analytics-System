// VisionLab – TypeScript API types

// ── Constrained option types (mirror backend Literal fields) ──────────────────
export type EmotionMode = 'standard' | 'simple' | 'social_story'
export type StoryType = 'fun_adventure' | 'social_story' | 'educational'
export type Difficulty = 'beginner' | 'intermediate' | 'advanced'
export type DetectorModel = 'fast' | 'balanced' | 'advanced'
export type SceneModel = 'blip' | 'git' | 'vitgpt2'

export interface AnalysisUploadOptions {
  emotion_mode?: EmotionMode
  story_type?: StoryType
  difficulty?: Difficulty
  output_language?: string
  detector_model?: DetectorModel
  scene_model?: SceneModel
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded'
  service: string
  version: string
  checks: { database: 'ok' | 'error'; redis: 'ok' | 'error' }
}

export interface TokenResponse {
  access_token: string
  token_type: string
  role: string
}

// ── UI customisation settings (mirrors backend UserSettingsUpdate) ────────────
export type ThemeMode = 'light' | 'dark' | 'system'
export type ThemeAccent = 'mono' | 'clay' | 'taupe' | 'ochre' | 'plum' | 'charcoal'
export type Typography = 'editorial' | 'clean'
export type FontSize = 14 | 16 | 18
export type ReadingComfort = 'normal' | 'relaxed'
export type Density = 'comfortable' | 'compact'
export type SidebarState = 'expanded' | 'collapsed'
export type ContentWidth = 'standard' | 'wide'
export type Radius = 'rounded' | 'sharp'
export type Separation = 'border' | 'shadow'

export interface UiSettings {
  _v?: number
  mode?: ThemeMode
  accent?: ThemeAccent
  typography?: Typography
  font_size?: FontSize
  reading_comfort?: ReadingComfort
  density?: Density
  sidebar?: SidebarState
  content_width?: ContentWidth
  radius?: Radius
  separation?: Separation
  reduce_motion?: boolean
  high_contrast?: boolean
  underline_links?: boolean
}

export interface UserOut {
  id: string
  username: string
  email: string
  role: string
  is_active: boolean
  created_at: string
  settings: UiSettings
}

export interface DetectionObject {
  label: string
  confidence: number
  bounding_box: [number, number, number, number]
  location: string
  model?: string | null
}

export interface EmotionResult {
  face_index: number
  emotion: string
  confidence: number
  child_friendly_label: string
  description: string
}

export interface OCRResult {
  raw_text: string | null
  translated_text: string | null
  language_detected: string | null
}

export interface SceneResult {
  description: string
  model?: string | null
  requested_model?: string | null
}

export interface StoryResult {
  story_type: string
  content: string
}

export interface QuizQuestion {
  word: string
  question_type: string
  question: string
  options: string[] | null
  correct_answer: string
}

export interface AnalysisResult {
  task_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  detections: DetectionObject[] | null
  emotions: EmotionResult[] | null
  ocr: OCRResult | null
  scene: SceneResult | null
  stories: StoryResult[] | null
  quiz_questions: QuizQuestion[] | null
  audio_url: string | null
  annotated_image_url: string | null 
  processing_ms: number | null
}

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type TaskCurrentStep =
  | 'queued'
  | 'detection'
  | 'emotion'
  | 'ocr'
  | 'scene'
  | 'story'
  | 'tts'
  | 'quiz'
  | 'completed'
  | 'failed'

export type TaskStepStatus = 'waiting' | 'running' | 'done' | 'skipped' | 'failed'

export interface TaskStepDetail {
  status: TaskStepStatus
  seconds: number | null
}

export interface TaskStepDetails {
  detection: TaskStepDetail
  emotion: TaskStepDetail
  ocr: TaskStepDetail
  scene: TaskStepDetail
  story: TaskStepDetail
  tts: TaskStepDetail
  quiz: TaskStepDetail
}

export interface TaskStatusResponse {
  task_id: string
  celery_task_id: string | null
  status: TaskStatus
  created_at: string
  completed_at: string | null
  processing_ms: number | null
  original_filename: string | null

  current_step: TaskCurrentStep | null
  progress_message: string | null
  progress_percent: number
  step_details: TaskStepDetails

  error_message: string | null
}

export interface VocabularyProgressItem {
  word: string
  difficulty: string
  repetitions: number
  interval: number
  easiness_factor: number
  next_review_at: string
  last_reviewed_at: string | null
}

export interface VocabularyProgressResponse {
  user_id: string
  total_words: number
  items: VocabularyProgressItem[]
}

export interface ReviewWordResponse {
  user_id: string
  due_words: VocabularyProgressItem[]
}

export interface QuizSubmissionResponse {
  word: string
  is_correct: boolean
  sm2_quality: number
  next_review_at: string
  new_interval: number
  new_easiness_factor: number
}

export interface AdminAnalyticsResponse {
  total_users: number
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  avg_processing_ms: number | null
  tasks_last_24h: number
  top_detected_objects: { label: string; count: number }[]
}