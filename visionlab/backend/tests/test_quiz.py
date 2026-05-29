from __future__ import annotations

import pytest
from app.services.quiz import generate_quiz_questions, sm2_update, quality_from_correctness


class TestSM2Algorithm:
    def test_correct_answer_increases_interval(self):
        ef, interval, reps, next_review = sm2_update(2.5, 1, 0, quality=5)
        assert interval == 1  # First repetition always 1 day
        assert reps == 1
        assert ef >= 2.5

    def test_second_repetition_interval(self):
        ef, interval, reps, _ = sm2_update(2.5, 1, 1, quality=4)
        assert interval == 6

    def test_third_repetition_uses_ef(self):
        ef, interval, reps, _ = sm2_update(2.5, 6, 2, quality=4)
        assert interval == round(6 * 2.5)

    def test_incorrect_resets_repetitions(self):
        ef, interval, reps, _ = sm2_update(2.5, 10, 5, quality=1)
        assert reps == 0
        assert interval == 1

    def test_ef_floor_at_1_3(self):
        ef, _, _, _ = sm2_update(1.3, 1, 0, quality=0)
        assert ef >= 1.3

    def test_quality_from_correct(self):
        assert quality_from_correctness(True) == 4
        assert quality_from_correctness(False) == 0

    def test_quality_from_fast_response(self):
        assert quality_from_correctness(True, response_time_ms=1000) == 5

    def test_quality_from_slow_response(self):
        assert quality_from_correctness(True, response_time_ms=10000) == 3


class TestQuizGeneration:
    def test_generates_correct_count(self):
        labels = ["cat", "dog", "car", "bicycle"]
        questions = generate_quiz_questions(labels, difficulty="beginner", n=3)
        assert len(questions) == 3

    def test_question_structure(self):
        questions = generate_quiz_questions(["cat"], difficulty="beginner", n=1)
        q = questions[0]
        assert "word" in q
        assert "question_type" in q
        assert "question" in q
        assert "correct_answer" in q

    def test_unknown_labels_fallback(self):
        questions = generate_quiz_questions(["xyzunknown123"], difficulty="beginner", n=2)
        assert len(questions) == 2

    def test_difficulty_levels(self):
        for diff in ["beginner", "intermediate", "advanced"]:
            questions = generate_quiz_questions(["dog"], difficulty=diff, n=1)
            assert questions[0]["word"] == "dog"
