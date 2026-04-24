"""Tests for exam simulator request config validation."""

from __future__ import annotations

import pytest

from deeptutor.agents.exam_simulator.request_config import validate_exam_simulator_request_config


def _base_payload() -> dict:
    return {
        "mode": "strict",
        "topic": "Thermodynamics",
        "duration_minutes": 60,
        "question_mix": {"mcq": 10, "short": 3, "long": 2},
        "generation_source": "topic_only",
        "uploaded_doc_ids": [],
    }


def test_validate_exam_simulator_request_config_accepts_topic_only() -> None:
    config = validate_exam_simulator_request_config(_base_payload())
    assert config.mode == "strict"
    assert config.generation_source == "topic_only"


def test_validate_exam_simulator_request_config_accepts_topic_plus_docs() -> None:
    payload = _base_payload()
    payload["generation_source"] = "topic_plus_docs"
    payload["uploaded_doc_ids"] = ["doc-1", "doc-2"]
    config = validate_exam_simulator_request_config(payload)
    assert config.generation_source == "topic_plus_docs"
    assert config.uploaded_doc_ids == ["doc-1", "doc-2"]


def test_validate_exam_simulator_request_config_rejects_invalid_duration() -> None:
    payload = _base_payload()
    payload["duration_minutes"] = 3
    with pytest.raises(ValueError, match="Invalid exam simulator config"):
        validate_exam_simulator_request_config(payload)


def test_validate_exam_simulator_request_config_rejects_zero_total_mix() -> None:
    payload = _base_payload()
    payload["question_mix"] = {"mcq": 0, "short": 0, "long": 0}
    with pytest.raises(ValueError, match="question_mix"):
        validate_exam_simulator_request_config(payload)


def test_validate_exam_simulator_request_config_rejects_unknown_field() -> None:
    payload = _base_payload()
    payload["unknown"] = "nope"
    with pytest.raises(ValueError, match="Invalid exam simulator config"):
        validate_exam_simulator_request_config(payload)


def test_validate_exam_simulator_request_config_rejects_invalid_generation_source() -> None:
    payload = _base_payload()
    payload["generation_source"] = "hybrid"
    with pytest.raises(ValueError, match="Invalid exam simulator config"):
        validate_exam_simulator_request_config(payload)


def test_validate_exam_simulator_request_config_rejects_non_object() -> None:
    with pytest.raises(ValueError, match="requires an explicit config object"):
        validate_exam_simulator_request_config(None)


def test_validate_exam_simulator_request_config_rejects_topic_plus_docs_without_docs() -> None:
    payload = _base_payload()
    payload["generation_source"] = "topic_plus_docs"
    payload["uploaded_doc_ids"] = []
    with pytest.raises(ValueError, match="uploaded_doc_ids"):
        validate_exam_simulator_request_config(payload)


def test_validate_exam_simulator_request_config_rejects_topic_only_with_docs() -> None:
    payload = _base_payload()
    payload["generation_source"] = "topic_only"
    payload["uploaded_doc_ids"] = ["doc-1"]
    with pytest.raises(ValueError, match="uploaded_doc_ids"):
        validate_exam_simulator_request_config(payload)


@pytest.mark.parametrize("topic", ["", "   "])
def test_validate_exam_simulator_request_config_rejects_blank_topic(topic: str) -> None:
    payload = _base_payload()
    payload["topic"] = topic
    with pytest.raises(ValueError, match="topic"):
        validate_exam_simulator_request_config(payload)


def test_validate_save_answer_requires_question_id() -> None:
    with pytest.raises(ValueError, match="question_id"):
        validate_exam_simulator_request_config(
            {"exam_turn": "save_answer", "attempt_id": "a1", "question_id": "", "answer": "x"}
        )


def test_validate_followup_requires_attempt_id() -> None:
    with pytest.raises(ValueError, match="attempt_id"):
        validate_exam_simulator_request_config({"exam_turn": "submit", "attempt_id": "   "})


def test_validate_save_answer_accepts_minimal() -> None:
    cfg = validate_exam_simulator_request_config(
        {"exam_turn": "save_answer", "attempt_id": "att-1", "question_id": "mcq_1", "answer": "B"}
    )
    assert cfg.exam_turn == "save_answer"
    assert cfg.answer == "B"
