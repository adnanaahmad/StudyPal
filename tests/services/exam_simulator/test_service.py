"""Tests for ExamSimulatorService (strict timing + submit)."""

from __future__ import annotations

import pytest

from deeptutor.agents.exam_simulator.request_config import validate_exam_simulator_request_config
from deeptutor.services.exam_simulator import ExamSimulatorService


def _template(service: ExamSimulatorService):
    cfg = validate_exam_simulator_request_config(
        {
            "topic": "Calculus",
            "duration_minutes": 30,
            "question_mix": {"mcq": 2, "short": 1, "long": 1},
            "generation_source": "topic_only",
        }
    )
    return service.generate_template(cfg)


def test_auto_submit_marks_unanswered_and_sets_flag() -> None:
    t0 = 1_000_000.0

    def clock() -> float:
        return t0

    service = ExamSimulatorService(clock=clock)
    template = _template(service)
    attempt = service.start_attempt(template, user_id="u1")
    assert attempt.deadline_at == t0 + 30 * 60

    service.save_answer(attempt.id, "mcq_1", "A")

    result = service.auto_submit_if_deadline_passed(attempt.id, now=t0 + 30 * 60 + 1)
    assert result.skipped is False
    assert result.auto_submitted is True
    assert result.answered_count == 1
    assert result.unanswered_count == 3

    att = service.get_attempt(attempt.id)
    assert att is not None
    assert att.status == "submitted"
    assert att.auto_submitted is True


def test_auto_submit_skipped_before_deadline() -> None:
    t0 = 500.0
    service = ExamSimulatorService(clock=lambda: t0)
    template = _template(service)
    attempt = service.start_attempt(template, "u1")
    result = service.auto_submit_if_deadline_passed(attempt.id, now=t0 + 60)
    assert result.skipped is True
    assert service.get_attempt(attempt.id).status == "started"


def test_submit_manual_counts_answered() -> None:
    t0 = 0.0
    service = ExamSimulatorService(clock=lambda: t0)
    template = _template(service)
    attempt = service.start_attempt(template, "u1")
    service.save_answer(attempt.id, "mcq_1", "x")
    service.save_answer(attempt.id, "mcq_2", "y")
    service.save_answer(attempt.id, "short_1", "")
    result = service.submit_attempt(attempt.id)
    assert result.auto_submitted is False
    assert result.answered_count == 2
    assert result.unanswered_count == 2


def test_save_answer_after_submit_raises() -> None:
    service = ExamSimulatorService(clock=lambda: 0.0)
    template = _template(service)
    attempt = service.start_attempt(template, "u1")
    service.submit_attempt(attempt.id)
    with pytest.raises(RuntimeError, match="Cannot save"):
        service.save_answer(attempt.id, "mcq_1", "late")


def test_grade_submitted_attempt_requires_submitted_status() -> None:
    service = ExamSimulatorService(clock=lambda: 0.0)
    template = _template(service)
    attempt = service.start_attempt(template, "u1")
    with pytest.raises(RuntimeError, match="submitted before grading"):
        service.grade_submitted_attempt(attempt.id)


def test_grade_submitted_attempt_idempotent() -> None:
    service = ExamSimulatorService(clock=lambda: 0.0)
    template = _template(service)
    attempt = service.start_attempt(template, "u1")
    correct = template.mcq_answer_key["mcq_1"]
    service.save_answer(attempt.id, "mcq_1", correct)
    service.submit_attempt(attempt.id)
    s1 = service.grade_submitted_attempt(attempt.id)
    s2 = service.grade_submitted_attempt(attempt.id)
    assert s1 == s2
    assert service.get_attempt(attempt.id).status == "graded"
    assert s1["total"] >= 0
    assert s1["max_total"] > 0


def test_template_includes_questions_matching_ids() -> None:
    service = ExamSimulatorService(clock=lambda: 0.0)
    template = _template(service)
    assert len(template.questions) == len(template.question_ids)
    for q in template.questions:
        assert q.question_id in template.question_ids
        if q.qtype == "mcq":
            assert len(q.options) == 4


def test_save_answer_rejected_after_deadline() -> None:
    t0 = 1_000_000.0
    tick = [t0]

    def clock() -> float:
        return tick[0]

    service = ExamSimulatorService(clock=clock)
    template = _template(service)
    attempt = service.start_attempt(template, "u1")
    tick[0] = attempt.deadline_at + 1.0
    with pytest.raises(RuntimeError, match="deadline"):
        service.save_answer(attempt.id, "mcq_1", "A")
