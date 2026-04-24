"""In-memory exam simulator domain models (v1 scaffold)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ExamQuestion:
    """One exam item (delivery shape; no answer key on MCQ beyond server template)."""

    question_id: str
    qtype: str  # mcq | short | long
    prompt: str
    marks: int
    options: tuple[str, ...] = ()

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "question_id": self.question_id,
            "type": self.qtype,
            "prompt": self.prompt,
            "marks": self.marks,
            "options": list(self.options),
        }


@dataclass
class ExamTemplate:
    """Server-side exam blueprint created from a validated request."""

    id: str
    topic: str
    duration_minutes: int
    generation_source: str
    uploaded_doc_ids: tuple[str, ...]
    question_ids: tuple[str, ...]
    questions: tuple[ExamQuestion, ...] = ()
    mcq_answer_key: dict[str, str] = field(default_factory=dict)
    written_specs: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class ExamAttempt:
    """One timed exam sitting."""

    id: str
    template_id: str
    user_id: str
    status: str  # started | submitted | graded | expired
    started_at: float
    deadline_at: float
    submitted_at: float | None
    auto_submitted: bool
    answers: dict[str, str] = field(default_factory=dict)
    grading: dict[str, Any] | None = None


@dataclass
class SubmitResult:
    """Outcome of a submit or auto-submit call."""

    skipped: bool = False
    auto_submitted: bool = False
    answered_count: int = 0
    unanswered_count: int = 0
    attempt_id: str = ""
    status: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "skipped": self.skipped,
            "auto_submitted": self.auto_submitted,
            "answered_count": self.answered_count,
            "unanswered_count": self.unanswered_count,
            "attempt_id": self.attempt_id,
            "status": self.status,
        }
