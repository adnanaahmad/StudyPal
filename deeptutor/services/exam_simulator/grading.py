"""Deterministic exam grading (MCQ + rubric-scored written). LLM hook can replace written path later."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


def clamp_int(value: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, value))


@dataclass
class QuestionGrade:
    question_id: str
    awarded: int
    max_marks: int
    feedback: str
    confidence: Literal["high", "medium", "low"]
    rubric_breakdown: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "question_id": self.question_id,
            "awarded": self.awarded,
            "max_marks": self.max_marks,
            "feedback": self.feedback,
            "confidence": self.confidence,
            "rubric_breakdown": list(self.rubric_breakdown),
        }


def grade_mcq(
    *,
    question_id: str,
    user_answer: str,
    correct_answer: str,
    marks: int,
) -> QuestionGrade:
    ua = (user_answer or "").strip().upper()[:1]
    ca = (correct_answer or "").strip().upper()[:1]
    correct = bool(ua) and ua == ca
    awarded = marks if correct else 0
    feedback = (
        "Correct."
        if correct
        else f"Expected {ca!r}; you answered {(ua or '(blank)')!r}."
    )
    return QuestionGrade(
        question_id=question_id,
        awarded=awarded,
        max_marks=marks,
        feedback=feedback,
        confidence="high",
        rubric_breakdown=[],
    )


def _written_rubric_hit(student_lower: str, criterion_lower: str) -> bool:
    if not criterion_lower or not student_lower:
        return False
    if criterion_lower in student_lower:
        return True
    tokens = [t for t in criterion_lower.split() if len(t) > 3]
    return any(t in student_lower for t in tokens)


def grade_written_rubric(
    *,
    question_id: str,
    student_answer: str,
    rubric: list[dict[str, Any]],
    max_marks: int,
    model_answer: str = "",
) -> QuestionGrade:
    """Award rubric weights when the student text matches criterion keywords (bounded, deterministic)."""
    s = (student_answer or "").strip().lower()
    breakdown: list[dict[str, Any]] = []
    raw = 0
    for item in rubric:
        crit = str(item.get("criterion", ""))
        weight = int(item.get("weight", 0))
        crit_l = crit.lower()
        hit = _written_rubric_hit(s, crit_l)
        add = weight if hit else 0
        raw += add
        breakdown.append(
            {
                "criterion": crit,
                "weight": weight,
                "awarded": add,
                "matched": hit,
            }
        )
    awarded = clamp_int(raw, 0, max_marks)
    if awarded >= max_marks:
        conf: Literal["high", "medium", "low"] = "high"
    elif awarded > 0:
        conf = "medium"
    else:
        conf = "low"
    ref = (model_answer or "").strip()
    feedback_parts = [
        f"Score {awarded}/{max_marks} against the rubric.",
    ]
    if ref and awarded < max_marks:
        feedback_parts.append("Compare with the model answer for gaps.")
    return QuestionGrade(
        question_id=question_id,
        awarded=awarded,
        max_marks=max_marks,
        feedback=" ".join(feedback_parts),
        confidence=conf,
        rubric_breakdown=breakdown,
    )


def build_attempt_summary(grades: list[QuestionGrade]) -> dict[str, Any]:
    total = sum(g.awarded for g in grades)
    max_total = sum(g.max_marks for g in grades)
    pct = (100.0 * total / max_total) if max_total else 0.0
    return {
        "total": total,
        "max_total": max_total,
        "percentage": round(pct, 2),
        "questions": [g.to_dict() for g in grades],
    }


__all__ = [
    "QuestionGrade",
    "build_attempt_summary",
    "clamp_int",
    "grade_mcq",
    "grade_written_rubric",
]
