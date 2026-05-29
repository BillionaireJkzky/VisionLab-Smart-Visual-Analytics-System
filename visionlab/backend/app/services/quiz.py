from __future__ import annotations

import json
import logging
import random
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional, TypedDict

from app.core.config import settings

logger = logging.getLogger(__name__)

_quiz_client = None


def _get_quiz_client():
    global _quiz_client
    if _quiz_client is not None:
        return _quiz_client
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        _quiz_client = genai
        return _quiz_client
    except Exception as exc:
        logger.warning("Quiz Gemini client init failed: %s", exc)
        return None


def _generate_gemini_quiz(
    texts: list[str],
    difficulty: str,
    n: int,
) -> list[QuizQuestionDict]:
    client = _get_quiz_client()
    if not client:
        return []

    combined_text = "\n\n".join(texts)[:3500]

    difficulty_guide = {
        "beginner":     "simple, common words suitable for ages 5–8",
        "intermediate": "moderately complex words suitable for ages 9–12",
        "advanced":     "more sophisticated vocabulary for older learners",
    }.get(difficulty, "educational vocabulary appropriate for the content")

    prompt = (
        f"You are a vocabulary quiz generator for English language learners.\n\n"
        f"Read this text carefully:\n---\n{combined_text}\n---\n\n"
        f"Generate exactly {n} vocabulary quiz questions. Choose words that:\n"
        f"- Actually appear in the text above\n"
        f"- Are educational and interesting (avoid 'the', 'and', 'was', 'that', 'with' etc.)\n"
        f"- Match this difficulty: {difficulty_guide}\n\n"
        f"Output ONLY a valid JSON array, no other text:\n"
        f'[\n'
        f'  {{\n'
        f'    "word": "the vocabulary word from the text",\n'
        f'    "question_type": "multiple_choice",\n'
        f'    "question": "What does \'word\' mean in this context?",\n'
        f'    "options": ["correct definition", "wrong option 1", "wrong option 2", "wrong option 3"],\n'
        f'    "correct_answer": "correct definition"\n'
        f'  }}\n'
        f']\n\n'
        f"Rules:\n"
        f"- correct_answer must exactly match one of the options\n"
        f"- All 4 options must be plausible, child-friendly definitions (under 12 words each)\n"
        f"- The word must be a single word (no phrases)\n"
        f"- Output only the JSON array, absolutely nothing else"
    )

    model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
    try:
        model = client.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        content = getattr(response, "text", None) or ""
        content = content.strip()

        # Strip markdown code fences if present
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\n?", "", content)
            content = re.sub(r"\n?```$", "", content.strip())

        data = json.loads(content.strip())
        if not isinstance(data, list):
            return []

        result: list[QuizQuestionDict] = []
        for item in data[:n]:
            if not isinstance(item, dict):
                continue
            word    = str(item.get("word", "")).strip()
            question = str(item.get("question", "")).strip()
            correct  = str(item.get("correct_answer", "")).strip()
            q_type   = str(item.get("question_type", "multiple_choice")).strip()
            options  = item.get("options")

            if not word or not question or not correct:
                continue

            if isinstance(options, list):
                options = [str(o) for o in options]
                if correct not in options:
                    options = [correct] + options[:3]
                random.shuffle(options)
            else:
                options = None

            result.append({
                "word":          word,
                "question_type": q_type,
                "question":      question,
                "options":       options,
                "correct_answer": correct,
            })

        logger.info("Gemini generated %d quiz questions from story text.", len(result))
        return result

    except Exception as exc:
        logger.warning("Gemini quiz generation failed: %s", exc)
        return []

_VOCAB_DEFINITIONS: dict[str, str] = {
    "person": "a human being",
    "face": "the front part of the head",
    "hand": "the part of the body at the end of the arm",
    "cat": "a small furry pet that meows",
    "dog": "a common pet animal that barks",
    "bird": "an animal with wings and feathers",
    "horse": "a large animal used for riding",
    "cow": "a large farm animal that gives milk",
    "elephant": "the largest land animal with a long trunk",
    "bear": "a large wild animal with thick fur",
    "zebra": "an animal with black and white stripes",
    "giraffe": "the tallest animal with a very long neck",
    "car": "a vehicle with four wheels used for travelling",
    "bicycle": "a vehicle with two wheels that you pedal",
    "motorcycle": "a vehicle with two wheels and an engine",
    "bus": "a large vehicle that carries many passengers",
    "truck": "a large vehicle used to carry heavy loads",
    "train": "a vehicle that travels on rails",
    "boat": "a vehicle used to travel on water",
    "airplane": "a vehicle with wings that flies through the air",
    "chair": "a piece of furniture for sitting on",
    "table": "a flat surface with legs used for eating or working",
    "sofa": "a comfortable seat for more than one person",
    "bed": "a piece of furniture used for sleeping",
    "book": "a set of printed pages you can read",
    "clock": "a device that shows the time",
    "vase": "a container for flowers",
    "laptop": "a portable computer",
    "phone": "a device used to make calls",
    "keyboard": "a set of keys used to type on a computer",
    "television": "a device with a screen that shows programmes",
    "apple": "a round fruit that is red or green",
    "banana": "a long yellow fruit",
    "orange": "a round orange citrus fruit",
    "sandwich": "two slices of bread with food in the middle",
    "pizza": "a flat round food with toppings and cheese",
    "cake": "a sweet food made from flour and eggs",
    "bottle": "a container used to hold liquids",
    "cup": "a small container used for drinking",
    "fork": "a tool with prongs used for eating food",
    "knife": "a tool with a blade used for cutting",
    "spoon": "a tool with a round bowl used for eating soup",
    "bowl": "a round container used for food",
    "plate": "a flat dish used for serving food",
    "tree": "a tall plant with a trunk and branches",
    "flower": "the colourful part of a plant",
    "garden": "a place where flowers or plants grow",
    "bench": "a long seat for more than one person",
    "umbrella": "a device that keeps you dry in the rain",
    "backpack": "a bag worn on the back",
    "ball": "a round object used in games",
    "happy": "feeling good and cheerful",
    "calm": "feeling peaceful and relaxed",
    "discovery": "finding or learning something new for the first time",
    "technology": "tools or machines made using science",
    "explore": "to look at something and learn about it",
    "scene": "everything we can see in one place",
    "object": "a thing that can be seen or touched",
    "various": "many different kinds of things",
}

_DISTRACTORS_POOL = list(_VOCAB_DEFINITIONS.values())


class QuizQuestionDict(TypedDict):
    word: str
    question_type: str
    question: str
    options: Optional[List[str]]
    correct_answer: str


def _normalise_text(text: str) -> str:
    return text.replace("**", "").replace("*", "").strip()


def _extract_candidate_words(stories, detected_labels=None):
    joined = " ".join(_normalise_text(s) for s in stories).lower()
    tokens = re.findall(r"[a-zA-Z][a-zA-Z\-']+", joined)
    if detected_labels:
        tokens += [lbl.lower().strip() for lbl in detected_labels]
    seen = set()
    out = []
    for t in tokens:
        if t in _VOCAB_DEFINITIONS and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _find_sentence_for_word(stories, word):
    text = " ".join(_normalise_text(s) for s in stories)
    for s in re.split(r"(?<=[.!?])\s+", text):
        if re.search(rf"\b{re.escape(word)}\b", s, re.I):
            return s.strip()
    return f"The story includes the word '{word}'."


def _get_definition(word):
    return _VOCAB_DEFINITIONS.get(word.lower(), f"a word used in the story: '{word}'")


def _make_multiple_choice(word: str, difficulty: str) -> QuizQuestionDict:
    correct = _get_definition(word)
    distractors = random.sample(
        [d for d in _DISTRACTORS_POOL if d != correct],
        k=min(3, len(_DISTRACTORS_POOL) - 1),
    )
    options = distractors + [correct]
    random.shuffle(options)
    question = (
        f"What does '{word}' mean?"
        if difficulty == "beginner"
        else f"Which meaning best matches '{word}'?"
    )
    return {
        "word": word,
        "question_type": "multiple_choice",
        "question": question,
        "options": options,
        "correct_answer": correct,
    }


def _make_fill_blank(word: str, stories: list[str], difficulty: str) -> QuizQuestionDict:
    sentence = _find_sentence_for_word(stories, word)
    blanked = re.sub(rf"\b{re.escape(word)}\b", "_____", sentence, count=1, flags=re.I)
    return {
        "word": word,
        "question_type": "fill_blank",
        "question": f"Fill in the blank:\n\n{blanked}",
        "options": None,
        "correct_answer": word,
    }


def _make_true_false(word: str, difficulty: str) -> QuizQuestionDict:
    definition = _get_definition(word)
    is_true = random.random() > 0.5
    if is_true:
        statement = f"In the story, '{word}' means {definition}."
        answer = "True"
    else:
        wrong_def = random.choice([d for d in _DISTRACTORS_POOL if d != definition])
        statement = f"In the story, '{word}' means {wrong_def}."
        answer = "False"
    return {
        "word": word,
        "question_type": "true_false",
        "question": f"True or False: {statement}",
        "options": ["True", "False"],
        "correct_answer": answer,
    }


def generate_quiz_questions(
    story_texts: list[str],
    difficulty: str = "beginner",
    n: int = 3,
    detected_labels: Optional[list[str]] = None,
) -> list[QuizQuestionDict]:
    if not story_texts:
        return []

    # Gemini generates richer questions using actual words from stories + scene.
    gemini_questions = _generate_gemini_quiz(story_texts, difficulty, n)
    if gemini_questions:
        return gemini_questions

    # Fallback: rule-based extraction against the hardcoded vocabulary dictionary.
    logger.info("Falling back to rule-based quiz generation.")
    candidates = _extract_candidate_words(story_texts, detected_labels)
    if not candidates:
        candidates = random.sample(list(_VOCAB_DEFINITIONS.keys()), min(n, len(_VOCAB_DEFINITIONS)))
    words = random.sample(candidates, min(n, len(candidates)))
    out = []
    for i, word in enumerate(words):
        if i % 3 == 0:
            out.append(_make_multiple_choice(word, difficulty))
        elif i % 3 == 1:
            out.append(_make_fill_blank(word, story_texts, difficulty))
        else:
            out.append(_make_true_false(word, difficulty))
    return out


def sm2_update(
    easiness_factor: float,
    interval: int,
    repetitions: int,
    quality: int,
) -> tuple[float, int, int, datetime]:
    if quality < 3:
        new_reps, new_int = 0, 1
    else:
        new_int = (
            1 if repetitions == 0
            else 6 if repetitions == 1
            else round(interval * easiness_factor)
        )
        new_reps = repetitions + 1
    new_ef = max(
        1.3,
        round(easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)), 4),
    )
    return new_ef, new_int, new_reps, datetime.now(timezone.utc) + timedelta(days=new_int)


def quality_from_correctness(is_correct, response_time_ms=None):
    if not is_correct:
        return 0  # SM-2 quality 0 = complete blackout — maximum EF penalty and full reset
    if response_time_ms is None:
        return 4
    if response_time_ms < 3000:
        return 5
    if response_time_ms < 8000:
        return 4
    return 3