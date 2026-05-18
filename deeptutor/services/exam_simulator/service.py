"""Strict exam lifecycle: template generation, attempt timing, submit, auto-submit."""

from __future__ import annotations

from collections.abc import Callable
import time
from typing import Any
import uuid

from deeptutor.agents.exam_simulator.request_config import ExamSimulatorRequestConfig
from deeptutor.services.exam_simulator.grading import (
    build_attempt_summary,
    grade_mcq,
    grade_written_rubric,
)
from deeptutor.services.exam_simulator.models import ExamAttempt, ExamQuestion, ExamTemplate, SubmitResult
from deeptutor.services.llm.client import get_llm_client
from deeptutor.utils.json_parser import parse_json_response

_DEFAULT_WRITTEN_RUBRIC: list[dict[str, Any]] = [
    {"criterion": "uses relevant technical vocabulary", "weight": 2},
    {"criterion": "explains the core concept clearly", "weight": 2},
    {"criterion": "example or reasoning", "weight": 1},
]

_exam_simulator_service_singleton: ExamSimulatorService | None = None


def get_exam_simulator_service() -> ExamSimulatorService:
    """Process-wide exam store so follow-up turns (save/submit) hit the same attempts."""
    global _exam_simulator_service_singleton
    if _exam_simulator_service_singleton is None:
        _exam_simulator_service_singleton = ExamSimulatorService()
    return _exam_simulator_service_singleton


def reset_exam_simulator_service_for_tests() -> None:
    """Clear singleton between tests (pytest)."""
    global _exam_simulator_service_singleton
    _exam_simulator_service_singleton = None


def _question_ids_from_mix(mcq: int, short: int, long: int) -> tuple[str, ...]:
    ids: list[str] = []
    for i in range(mcq):
        ids.append(f"mcq_{i + 1}")
    for i in range(short):
        ids.append(f"short_{i + 1}")
    for i in range(long):
        ids.append(f"long_{i + 1}")
    return tuple(ids)


async def _build_all_questions(
    topic: str,
    qids: tuple[str, ...],
) -> tuple[tuple[ExamQuestion, ...], dict[str, str], dict[str, dict[str, Any]]]:
    mcq_qids = [q for q in qids if q.startswith("mcq_")]
    short_qids = [q for q in qids if q.startswith("short_")]
    long_qids = [q for q in qids if q.startswith("long_")]

    prompt = f"""Generate an exam on the topic of "{topic}".
It must contain:
- {len(mcq_qids)} multiple-choice questions (each with exactly 4 options).
- {len(short_qids)} short-answer questions.
- {len(long_qids)} long-answer questions.

Return the result as a JSON object matching this schema:
{{
  "mcq": [
    {{
      "prompt": "...",
      "options": ["...", "...", "...", "..."],
      "correct_letter": "A"
    }}
  ],
  "short": [
    {{
      "prompt": "...",
      "model_answer": "..."
    }}
  ],
  "long": [
    {{
      "prompt": "...",
      "model_answer": "..."
    }}
  ]
}}
Ensure the correct_letter corresponds exactly to one of the 4 options (A=index 0, B=1, C=2, D=3).
"""
    llm = get_llm_client()
    response_text = await llm.complete(
        prompt=prompt,
        system_prompt="You are an expert exam generator. Follow the JSON schema strictly.",
    )
    
    data = parse_json_response(response_text)
    
    mcq_key: dict[str, str] = {}
    written_specs: dict[str, dict[str, Any]] = {}
    merged: list[ExamQuestion] = []
    
    if not isinstance(data, dict):
        data = {}
        
    mcq_data = data.get("mcq", [])
    if not isinstance(mcq_data, list):
        mcq_data = []
        
    for i, qid in enumerate(mcq_qids):
        item = mcq_data[i] if i < len(mcq_data) else {}
        options = item.get("options", ["A", "B", "C", "D"])
        letter = item.get("correct_letter", "A")
        if not isinstance(options, list) or len(options) != 4:
            options = ["A", "B", "C", "D"]
            
        merged.append(
            ExamQuestion(
                question_id=qid,
                qtype="mcq",
                prompt=item.get("prompt", f"MCQ on {topic}"),
                marks=2,
                options=tuple(options),
            )
        )
        mcq_key[qid] = letter

    short_data = data.get("short", [])
    if not isinstance(short_data, list):
        short_data = []
        
    for i, qid in enumerate(short_qids):
        item = short_data[i] if i < len(short_data) else {}
        written_specs[qid] = {
            "max_marks": 5,
            "rubric": list(_DEFAULT_WRITTEN_RUBRIC),
            "model_answer": item.get("model_answer", ""),
        }
        merged.append(
            ExamQuestion(
                question_id=qid,
                qtype="short",
                prompt=item.get("prompt", f"Short answer on {topic}"),
                marks=5,
                options=(),
            )
        )

    long_data = data.get("long", [])
    if not isinstance(long_data, list):
        long_data = []
        
    for i, qid in enumerate(long_qids):
        item = long_data[i] if i < len(long_data) else {}
        written_specs[qid] = {
            "max_marks": 10,
            "rubric": list(_DEFAULT_WRITTEN_RUBRIC),
            "model_answer": item.get("model_answer", ""),
        }
        merged.append(
            ExamQuestion(
                question_id=qid,
                qtype="long",
                prompt=item.get("prompt", f"Long answer on {topic}"),
                marks=10,
                options=(),
            )
        )

    return tuple(merged), mcq_key, written_specs


class ExamSimulatorService:
    """In-memory exam orchestration (replace with persistence in a later iteration)."""

    def __init__(self, clock: Callable[[], float] | None = None) -> None:
        self._clock = clock or time.time
        self._templates: dict[str, ExamTemplate] = {}
        self._attempts: dict[str, ExamAttempt] = {}

    async def generate_template(self, cfg: ExamSimulatorRequestConfig) -> ExamTemplate:
        mix = cfg.question_mix
        assert mix is not None
        qids = _question_ids_from_mix(mix.mcq, mix.short, mix.long)
        questions, mcq_key, written = await _build_all_questions(cfg.topic, qids)
        template = ExamTemplate(
            id=str(uuid.uuid4()),
            topic=cfg.topic,
            duration_minutes=cfg.duration_minutes,
            generation_source=cfg.generation_source,
            uploaded_doc_ids=tuple(cfg.uploaded_doc_ids),
            question_ids=qids,
            questions=questions,
            mcq_answer_key=mcq_key,
            written_specs=written,
        )
        self._templates[template.id] = template
        return template

    def get_template(self, template_id: str) -> ExamTemplate | None:
        return self._templates.get(template_id)

    def get_attempt(self, attempt_id: str) -> ExamAttempt | None:
        return self._attempts.get(attempt_id)

    def start_attempt(self, template: ExamTemplate, user_id: str) -> ExamAttempt:
        now = self._clock()
        deadline = now + float(template.duration_minutes * 60)
        attempt = ExamAttempt(
            id=str(uuid.uuid4()),
            template_id=template.id,
            user_id=user_id,
            status="started",
            started_at=now,
            deadline_at=deadline,
            submitted_at=None,
            auto_submitted=False,
            answers={},
        )
        self._attempts[attempt.id] = attempt
        return attempt

    def save_answer(
        self,
        attempt_id: str,
        question_id: str,
        response: str,
        *,
        last_client_seq: int = 0,
    ) -> None:
        del last_client_seq  # reserved for optimistic concurrency / replay
        attempt = self._require_attempt(attempt_id)
        if attempt.status != "started":
            raise RuntimeError(f"Cannot save answers when attempt status is {attempt.status}.")
        now = self._clock()
        if now >= attempt.deadline_at:
            raise RuntimeError("The exam deadline has passed; your answers are locked.")
        attempt.answers[question_id] = response

    def submit_attempt(self, attempt_id: str, *, auto_submitted: bool = False) -> SubmitResult:
        attempt = self._require_attempt(attempt_id)
        if attempt.status != "started":
            return SubmitResult(skipped=True, attempt_id=attempt_id, status=attempt.status)

        template = self._require_template(attempt.template_id)
        total = len(template.question_ids)
        answered = sum(1 for q in template.question_ids if attempt.answers.get(q, "").strip() != "")
        attempt.status = "submitted"
        attempt.submitted_at = self._clock()
        attempt.auto_submitted = auto_submitted
        return SubmitResult(
            skipped=False,
            auto_submitted=auto_submitted,
            answered_count=answered,
            unanswered_count=total - answered,
            attempt_id=attempt_id,
            status=attempt.status,
        )

    def auto_submit_if_deadline_passed(
        self,
        attempt_id: str,
        now: float | None = None,
    ) -> SubmitResult:
        attempt = self._require_attempt(attempt_id)
        if attempt.status != "started":
            return SubmitResult(skipped=True, attempt_id=attempt_id, status=attempt.status)
        tnow = self._clock() if now is None else now
        if tnow < attempt.deadline_at:
            return SubmitResult(skipped=True, attempt_id=attempt_id, status=attempt.status)
        return self.submit_attempt(attempt_id, auto_submitted=True)

    def grade_submitted_attempt(self, attempt_id: str) -> dict[str, Any]:
        """Score a submitted attempt; idempotent if already graded."""
        attempt = self._require_attempt(attempt_id)
        if attempt.status not in ("submitted", "graded"):
            raise RuntimeError("Attempt must be submitted before grading.")
        if attempt.grading is not None:
            return attempt.grading

        template = self._require_template(attempt.template_id)
        mcq_marks = 2
        grades = []
        for qid in template.question_ids:
            if qid.startswith("mcq_"):
                correct = template.mcq_answer_key.get(qid, "A")
                grades.append(
                    grade_mcq(
                        question_id=qid,
                        user_answer=attempt.answers.get(qid, ""),
                        correct_answer=correct,
                        marks=mcq_marks,
                    )
                )
            else:
                spec = template.written_specs.get(qid, {})
                rubric = list(spec.get("rubric", _DEFAULT_WRITTEN_RUBRIC))
                max_marks = int(spec.get("max_marks", 5))
                model = str(spec.get("model_answer", ""))
                grades.append(
                    grade_written_rubric(
                        question_id=qid,
                        student_answer=attempt.answers.get(qid, ""),
                        rubric=rubric,
                        max_marks=max_marks,
                        model_answer=model,
                    )
                )

        summary = build_attempt_summary(grades)
        attempt.status = "graded"
        attempt.grading = summary
        return summary

    def public_questions_payload(self, template: ExamTemplate) -> list[dict[str, Any]]:
        return [q.to_public_dict() for q in template.questions]

    def public_attempt_payload(
        self, attempt: ExamAttempt, template: ExamTemplate, *, include_server_answers: bool = False
    ) -> dict[str, Any]:
        """Fields safe to send to the client (no answer key)."""
        payload: dict[str, Any] = {
            "attempt_id": attempt.id,
            "template_id": template.id,
            "topic": template.topic,
            "deadline_at": attempt.deadline_at,
            "started_at": attempt.started_at,
            "status": attempt.status,
            "question_count": len(template.question_ids),
            "question_ids": list(template.question_ids),
            "generation_source": template.generation_source,
            "questions": self.public_questions_payload(template),
        }
        if include_server_answers:
            payload["answers"] = dict(attempt.answers)
        return payload

    def _require_attempt(self, attempt_id: str) -> ExamAttempt:
        attempt = self._attempts.get(attempt_id)
        if attempt is None:
            raise KeyError(f"Unknown attempt_id: {attempt_id}")
        return attempt

    def _require_template(self, template_id: str) -> ExamTemplate:
        template = self._templates.get(template_id)
        if template is None:
            raise KeyError(f"Unknown template_id: {template_id}")
        return template
