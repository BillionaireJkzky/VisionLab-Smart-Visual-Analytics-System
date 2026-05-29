from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalysisRequest(BaseModel):
    emotion_mode: Literal["standard", "simple", "social_story"] = Field(default="standard")
    story_types: list[Literal["fun_adventure", "social_story", "educational"]] = Field(
        default=["fun_adventure", "social_story", "educational"]
    )
    difficulty: Literal["beginner", "intermediate", "advanced"] = Field(default="beginner")
    output_language: str = Field(default="en")
    detector_model: Literal["fast", "balanced", "advanced"] = Field(default="balanced")
    scene_model: Literal["blip", "git", "vitgpt2"] = Field(default="git")


class TaskStepDetail(BaseModel):
    status: Literal["waiting", "running", "done", "skipped", "failed"]
    seconds: Optional[float] = None


class TaskStatusResponse(BaseModel):
    task_id: uuid.UUID
    celery_task_id: Optional[str] = None
    status: Literal["pending", "processing", "completed", "failed"]

    created_at: datetime
    completed_at: Optional[datetime] = None
    processing_ms: Optional[int] = None
    original_filename: Optional[str] = None

    current_step: Optional[Literal[
        "queued",
        "detection",
        "emotion",
        "ocr",
        "scene",
        "story",
        "tts",
        "quiz",
        "completed",
        "failed",
    ]] = None

    progress_message: Optional[str] = None
    progress_percent: int = Field(default=0, ge=0, le=100)
    step_details: Dict[str, TaskStepDetail] = Field(default_factory=dict)
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class DetectionObject(BaseModel):
    label: str
    confidence: float
    bounding_box: List[float]
    location: str
    model: Optional[str] = None


class EmotionResult(BaseModel):
    face_index: int
    emotion: str
    confidence: float
    child_friendly_label: str
    description: str


class OCRResult(BaseModel):
    raw_text: str
    translated_text: Optional[str]
    language_detected: Optional[str]


class SceneResult(BaseModel):
    description: str
    model: Optional[str] = None
    requested_model: Optional[str] = None


class StoryResult(BaseModel):
    story_type: str
    content: str


class QuizQuestion(BaseModel):
    word: str
    question_type: str
    question: str
    options: Optional[List[str]]
    correct_answer: str


class AnalysisResult(BaseModel):
    task_id: uuid.UUID
    status: Literal["pending", "processing", "completed", "failed"]

    detections: Optional[List[DetectionObject]] = None
    emotions: Optional[List[EmotionResult]] = None
    ocr: Optional[OCRResult] = None
    scene: Optional[SceneResult] = None
    stories: Optional[List[StoryResult]] = None
    quiz_questions: Optional[List[QuizQuestion]] = None

    audio_url: Optional[str] = None
    annotated_image_url: Optional[str] = None
    processing_ms: Optional[int] = None

    model_config = {"from_attributes": True}


class QuizSubmission(BaseModel):
    word: str
    user_answer: str
    correct_answer: str
    task_id: Optional[uuid.UUID] = None
    response_time_ms: Optional[int] = None


class QuizSubmissionResponse(BaseModel):
    word: str
    is_correct: bool
    sm2_quality: int
    next_review_at: datetime
    new_interval: int
    new_easiness_factor: float


class VocabularyProgressItem(BaseModel):
    word: str
    difficulty: str
    repetitions: int
    interval: int
    easiness_factor: float
    next_review_at: datetime
    last_reviewed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class VocabularyProgressResponse(BaseModel):
    user_id: uuid.UUID
    total_words: int
    items: List[VocabularyProgressItem]


class ReviewWordResponse(BaseModel):
    user_id: uuid.UUID
    due_words: List[VocabularyProgressItem]


class AdminAnalyticsResponse(BaseModel):
    total_users: int
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    avg_processing_ms: Optional[float]
    tasks_last_24h: int
    top_detected_objects: List[Dict[str, Any]]