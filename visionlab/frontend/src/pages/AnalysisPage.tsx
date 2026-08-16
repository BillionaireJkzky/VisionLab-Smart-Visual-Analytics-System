import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type AriaAttributes,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  Upload,
  ImageIcon,
  X,
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ScanSearch,
  Smile,
  BookOpen,
  GraduationCap,
  Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { analysisApi, getApiErrorMessage } from '../services/api'
import { SurfaceCard } from '../components/ui'
import type { DetectorModel, Difficulty, EmotionMode, SceneModel, StoryType } from '../types/api'
import clsx from 'clsx'
const DETECTOR_MODELS = [
  { value: 'fast', label: 'Fast', desc: 'YOLO11 Nano (yolo11n.pt)' },
  { value: 'balanced', label: 'Balanced', desc: 'YOLO11 Small (yolo11s.pt)' },
  { value: 'advanced', label: 'Advanced', desc: 'YOLO11 Small (yolo11s.pt)' },
]

const SCENE_MODELS = [
  { value: 'blip', label: 'Fast', desc: 'BLIP Large — quick caption' },
  { value: 'git', label: 'Balanced', desc: 'GIT Large — better detail' },
  { value: 'vitgpt2', label: 'Advanced', desc: 'ViT-GPT2 — richer caption, still fast' },
]

const EMOTION_MODES = [
  { value: 'standard', label: 'Standard', desc: 'Child-friendly natural language' },
  { value: 'simple', label: 'Simple', desc: 'Short labels only' },
  { value: 'social_story', label: 'Social Story', desc: 'Carol Gray format (ASD)' },
]

const STORY_TYPES = [
  { value: 'fun_adventure', label: 'Fun Adventure', desc: 'Imaginative story for all children' },
  { value: 'social_story', label: 'Social Story', desc: 'ASD-focused social understanding' },
  { value: 'educational', label: 'Educational', desc: 'Vocabulary-focused for ELL learners' },
]

const DIFFICULTIES = [
  { value: 'beginner', label: 'Beginner', desc: 'Recommended for beginner learners' },
  { value: 'intermediate', label: 'Intermediate', desc: 'Recommended for intermediate learners' },
  { value: 'advanced', label: 'Advanced', desc: 'Recommended for advanced learners' },
]

type Option = {
  value: string
  label: string
  desc: string
}

type Preset = {
  key: string
  label: string
  desc: string
  values: {
    detectorModel: string
    sceneModel: string
    emotionMode: string
    storyType: string
    difficulty: string
  }
}

const PRESETS: Preset[] = [
  {
    key: 'fast',
    label: 'Fast',
    desc: 'Quickest overall flow',
    values: {
      detectorModel: 'fast',
      sceneModel: 'blip',
      emotionMode: 'simple',
      storyType: 'fun_adventure',
      difficulty: 'beginner',
    },
  },
  {
    key: 'balanced',
    label: 'Balanced',
    desc: 'Best default for most people',
    values: {
      detectorModel: 'balanced',
      sceneModel: 'git',
      emotionMode: 'standard',
      storyType: 'fun_adventure',
      difficulty: 'beginner',
    },
  },
  {
    key: 'detail',
    label: 'Detailed',
    desc: 'Richer scene and learning output',
    values: {
      detectorModel: 'advanced',
      sceneModel: 'vitgpt2',
      emotionMode: 'standard',
      storyType: 'educational',
      difficulty: 'intermediate',
    },
  },
]

function formatFileSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function PresetButton({
  label,
  desc,
  active,
  onClick,
}: {
  label: string
  desc: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'text-left border rounded transition-colors duration-150 p-4',
        active
          ? 'border-ink bg-accent-subtle'
          : 'border-line bg-paper-raised hover:border-line-strong'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-ink-muted mt-1">{desc}</p>
        </div>
        {active ? (
          <span className="w-7 h-7 rounded-full bg-ink flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 text-paper" />
          </span>
        ) : null}
      </div>
    </button>
  )
}

function SelectField({
  id,
  label,
  hint,
  icon: Icon,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  hint: string
  icon: ComponentType<{ className?: string; 'aria-hidden'?: AriaAttributes['aria-hidden'] }>
  value: string
  options: Option[]
  onChange: (value: string) => void
}) {
  return (
    <div className="border border-line rounded bg-paper-raised p-4">
      <div className="flex items-start gap-3 mb-4">
        <Icon className="w-4 h-4 text-ink-muted mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          <p className="text-xs text-ink-muted mt-1">{hint}</p>
        </div>
      </div>

      <div className="relative">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded border border-line-strong bg-paper-raised px-4 py-3 pr-10 text-sm text-ink outline-none transition-colors focus:border-ink"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.desc}
            </option>
          ))}
        </select>

        <ChevronDown className="w-4 h-4 text-ink-faint absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  )
}

export default function AnalysisPage() {
  const navigate = useNavigate()

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const [detectorModel, setDetectorModel] = useState('balanced')
  const [sceneModel, setSceneModel] = useState('git')
  const [emotionMode, setEmotionMode] = useState('standard')
  const [storyType, setStoryType] = useState('fun_adventure')
  const [difficulty, setDifficulty] = useState('beginner')

  const [loading, setLoading] = useState(false)

  const isHeavyCombo = useMemo(
    () => detectorModel === 'advanced' || sceneModel === 'vitgpt2',
    [detectorModel, sceneModel]
  )

  const activePreset = useMemo(() => {
    return (
      PRESETS.find(
        (preset) =>
          preset.values.detectorModel === detectorModel &&
          preset.values.sceneModel === sceneModel &&
          preset.values.emotionMode === emotionMode &&
          preset.values.storyType === storyType &&
          preset.values.difficulty === difficulty
      )?.key ?? null
    )
  }, [detectorModel, sceneModel, emotionMode, storyType, difficulty])

  const selectedSummary = useMemo(
    () => ({
      detector: DETECTOR_MODELS.find((o) => o.value === detectorModel)?.label ?? detectorModel,
      scene: SCENE_MODELS.find((o) => o.value === sceneModel)?.label ?? sceneModel,
      emotion: EMOTION_MODES.find((o) => o.value === emotionMode)?.label ?? emotionMode,
      story: STORY_TYPES.find((o) => o.value === storyType)?.label ?? storyType,
      difficulty: DIFFICULTIES.find((o) => o.value === difficulty)?.label ?? difficulty,
      preset: PRESETS.find((preset) => preset.key === activePreset)?.label ?? 'Custom',
    }),
    [detectorModel, sceneModel, emotionMode, storyType, difficulty, activePreset]
  )

  const clearSelectedFile = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
  }, [preview])

  const onDrop = useCallback(
    (accepted: File[]) => {
      const nextFile = accepted[0]
      if (!nextFile) return

      if (preview) URL.revokeObjectURL(preview)

      setFile(nextFile)
      setPreview(URL.createObjectURL(nextFile))
    },
    [preview]
  )

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.bmp'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    onDropRejected: () => toast.error('File rejected. Max 10 MB, images only.'),
  })

  const applyPreset = (preset: Preset) => {
    setDetectorModel(preset.values.detectorModel)
    setSceneModel(preset.values.sceneModel)
    setEmotionMode(preset.values.emotionMode)
    setStoryType(preset.values.storyType)
    setDifficulty(preset.values.difficulty)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!file) {
      toast.error('Please select an image first.')
      return
    }

    setLoading(true)

    try {
      const res = await analysisApi.upload(file, {
        emotion_mode: emotionMode as EmotionMode,
        story_type: storyType as StoryType,
        difficulty: difficulty as Difficulty,
        detector_model: detectorModel as DetectorModel,
        scene_model: sceneModel as SceneModel,
      })

      toast.success(
        isHeavyCombo
          ? 'Image submitted! This setup may take longer than usual.'
          : 'Image submitted! Processing…'
      )

      navigate(`/result/${res.data.task_id}`)
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Upload failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto animate-fade-in space-y-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        <SurfaceCard padded={false}>
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-lg p-8 md:p-10 transition-colors duration-150 cursor-pointer',
              isDragActive
                ? 'border-ink bg-accent-subtle'
                : 'border-transparent hover:bg-paper'
            )}
            role="button"
            aria-label="Upload image. Drag and drop or click to select."
          >
            <input {...getInputProps({ capture: 'environment' })} aria-label="Image file input" />

            {preview ? (
              <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-8 items-center">
                <div className="relative">
                  <img
                    src={preview}
                    alt="Preview of selected image"
                    className="w-full max-h-[360px] object-cover border border-line rounded"
                  />

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearSelectedFile()
                    }}
                    className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-ink text-paper flex items-center justify-center hover:bg-accent-hover"
                    aria-label="Remove selected image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-faint mb-3">
                    Image selected
                  </p>

                  <h2 className="font-display text-2xl md:text-3xl font-medium text-ink break-words">
                    {file?.name}
                  </h2>

                  <p className="mt-3 text-ink-muted leading-7">
                    Your image is ready. Adjust the configuration only if needed, then start the
                    analysis when you’re happy with the setup.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded px-2.5 py-1 text-xs font-mono border border-line-strong bg-paper-raised text-ink">
                      {selectedSummary.detector}
                    </span>
                    <span className="inline-flex items-center rounded px-2.5 py-1 text-xs font-mono border border-line-strong bg-paper-raised text-ink">
                      {selectedSummary.scene}
                    </span>
                    <span className="inline-flex items-center rounded px-2.5 py-1 text-xs font-mono border border-line-strong bg-paper-raised text-ink">
                      {selectedSummary.story}
                    </span>
                  </div>

                  <div className="mt-5 text-sm font-mono text-ink-faint">
                    {formatFileSize(file?.size)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-10 md:py-14 text-center">
                <div className="w-14 h-14 rounded-full border border-line flex items-center justify-center mx-auto mb-5">
                  {isDragActive ? (
                    <Upload className="w-6 h-6 text-ink" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-ink-muted" />
                  )}
                </div>

                <h2 className="font-display text-2xl md:text-3xl font-medium text-ink">
                  {isDragActive ? 'Drop your image here' : 'Drag & drop or click to upload'}
                </h2>

                <p className="mt-3 text-ink-muted text-sm md:text-base">
                  JPEG, PNG, WEBP, BMP — up to 10 MB
                </p>
              </div>
            )}
          </div>
        </SurfaceCard>

        {isHeavyCombo && (
          <div className="border border-line-strong rounded bg-caution-subtle">
            <div className="px-4 py-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-caution mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-caution">Slower configuration selected</p>
                <p className="text-xs text-ink-muted mt-1 leading-5">
                  Advanced detection or advanced scene description may take longer. Balanced is
                  usually the best default.
                </p>
              </div>
            </div>
          </div>
        )}

        <SurfaceCard padded={false}>
          <div className="p-5 md:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">Workflow configuration</p>
                <p className="text-sm text-ink-muted mt-1">
                  Use a preset for speed, or open advanced settings for fine control.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowSettings((prev) => !prev)}
                className="btn-secondary self-start lg:self-auto"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {showSettings ? 'Hide Advanced Settings' : 'Advanced Settings'}
                {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              {PRESETS.map((preset) => (
                <PresetButton
                  key={preset.key}
                  label={preset.label}
                  desc={preset.desc}
                  active={activePreset === preset.key}
                  onClick={() => applyPreset(preset)}
                />
              ))}
            </div>

            {showSettings ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
                <SelectField
                  id="detector-model"
                  label="Object detection"
                  hint="Choose the speed and accuracy balance."
                  icon={ScanSearch}
                  value={detectorModel}
                  options={DETECTOR_MODELS}
                  onChange={setDetectorModel}
                />

                <SelectField
                  id="scene-model"
                  label="Scene description"
                  hint="Control the richness of scene understanding."
                  icon={ImageIcon}
                  value={sceneModel}
                  options={SCENE_MODELS}
                  onChange={setSceneModel}
                />

                <SelectField
                  id="emotion-mode"
                  label="Emotion mode"
                  hint="Select how emotion results are explained."
                  icon={Smile}
                  value={emotionMode}
                  options={EMOTION_MODES}
                  onChange={setEmotionMode}
                />

                <SelectField
                  id="story-type"
                  label="Story type"
                  hint="Set the tone of the generated story."
                  icon={BookOpen}
                  value={storyType}
                  options={STORY_TYPES}
                  onChange={setStoryType}
                />

                <SelectField
                  id="difficulty-level"
                  label="Quiz difficulty"
                  hint="Choose the learning challenge level."
                  icon={GraduationCap}
                  value={difficulty}
                  options={DIFFICULTIES}
                  onChange={setDifficulty}
                />
              </div>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard padded={false}>
          <div className="p-5 md:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <p className="text-sm font-semibold text-ink">Ready to analyse</p>
              <p className="text-sm text-ink-muted mt-1">
                Upload your image, confirm the setup, and start the pipeline.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={!file || loading}
                className="btn-primary min-w-[190px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Uploading…' : 'Analyse Image'}
              </button>

              <button
                type="button"
                onClick={clearSelectedFile}
                disabled={!file || loading}
                className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>
        </SurfaceCard>
      </form>
    </div>
  )
}