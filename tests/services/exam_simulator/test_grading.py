"""Tests for exam simulator grading helpers."""

from __future__ import annotations

from deeptutor.services.exam_simulator.grading import (
    build_attempt_summary,
    clamp_int,
    grade_mcq,
    grade_written_rubric,
)


def test_clamp_int() -> None:
    assert clamp_int(5, 0, 10) == 5
    assert clamp_int(-3, 0, 10) == 0
    assert clamp_int(99, 0, 10) == 10


def test_grade_mcq_deterministic() -> None:
    g = grade_mcq(
        question_id="mcq_1",
        user_answer="b",
        correct_answer="B",
        marks=3,
    )
    assert g.awarded == 3
    assert g.max_marks == 3
    assert g.confidence == "high"

    g2 = grade_mcq(
        question_id="mcq_1",
        user_answer="A",
        correct_answer="B",
        marks=3,
    )
    assert g2.awarded == 0


def test_grade_written_rubric_bounded() -> None:
    rubric = [
        {"criterion": "correct concept", "weight": 2},
        {"criterion": "clarity", "weight": 2},
        {"criterion": "example quality", "weight": 1},
    ]
    out = grade_written_rubric(
        question_id="short_1",
        student_answer=(
            "The core concept is entropy; vocabulary includes entropy and isolated. "
            "For example, heat flows spontaneously."
        ),
        rubric=rubric,
        max_marks=5,
        model_answer="Second law.",
    )
    assert 0 <= out.awarded <= 5
    assert out.awarded >= 1
    assert out.max_marks == 5
    assert out.feedback
    assert len(out.rubric_breakdown) == 3


def test_build_attempt_summary_percentage() -> None:
    g1 = grade_mcq(question_id="q1", user_answer="A", correct_answer="A", marks=2)
    g2 = grade_mcq(question_id="q2", user_answer="B", correct_answer="A", marks=2)
    s = build_attempt_summary([g1, g2])
    assert s["total"] == 2
    assert s["max_total"] == 4
    assert s["percentage"] == 50.0
    assert len(s["questions"]) == 2
