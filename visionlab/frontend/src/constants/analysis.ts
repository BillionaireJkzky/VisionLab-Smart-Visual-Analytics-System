// VisionLab – Analysis option constants (mirrors backend Literal constraints)
import type { DetectorModel, Difficulty, EmotionMode, SceneModel, StoryType } from '../types/api'

export const EMOTION_MODE_OPTIONS: { value: EmotionMode; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard', description: 'Full emotion analysis with confidence scores' },
  { value: 'simple', label: 'Simple', description: 'Basic emotion labels only' },
  { value: 'social_story', label: 'Social Story', description: 'Child-friendly emotional descriptions for ASD learners' },
]

export const STORY_TYPE_OPTIONS: { value: StoryType; label: string; description: string }[] = [
  { value: 'fun_adventure', label: 'Fun Adventure', description: 'Playful, imaginative storytelling' },
  { value: 'social_story', label: 'Social Story (ASD)', description: 'Structured narrative for social learning' },
  { value: 'educational', label: 'Educational', description: 'Vocabulary-focused learning content' },
]

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

export const DETECTOR_MODEL_OPTIONS: { value: DetectorModel; label: string; description: string }[] = [
  { value: 'fast', label: 'Fast', description: 'YOLO11n — quickest, lighter accuracy' },
  { value: 'balanced', label: 'Balanced', description: 'YOLO11s — best speed/accuracy trade-off (recommended)' },
  { value: 'advanced', label: 'Advanced', description: 'RT-DETR-L — highest accuracy, slower' },
]

export const SCENE_MODEL_OPTIONS: { value: SceneModel; label: string }[] = [
  { value: 'blip', label: 'BLIP' },
  { value: 'git', label: 'GIT (recommended)' },
  { value: 'vitgpt2', label: 'ViT-GPT2' },
]

export const STORY_TYPE_LABELS: Record<StoryType, string> = {
  fun_adventure: 'Fun Adventure',
  social_story: 'Social Story (ASD)',
  educational: 'Educational',
}
