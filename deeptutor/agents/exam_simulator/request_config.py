"""Validated request config for the exam simulator capability."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

GenerationSource = Literal["topic_only", "topic_plus_docs"]
ExamTurn = Literal["generate", "save_answer", "submit", "grade", "state"]


class ExamSimulatorQuestionMix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mcq: int = Field(ge=0)
    short: int = Field(ge=0)
    long: int = Field(ge=0)


class ExamSimulatorRequestConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exam_turn: ExamTurn = "generate"
    mode: Literal["strict"] = "strict"
    topic: str = ""
    duration_minutes: int = Field(default=30, ge=5, le=240)
    question_mix: ExamSimulatorQuestionMix | None = None
    generation_source: GenerationSource = "topic_only"
    uploaded_doc_ids: list[str] = Field(default_factory=list)
    attempt_id: str = ""
    question_id: str = ""
    answer: str = ""
    last_client_seq: int = Field(default=0, ge=0)

    @field_validator("topic")
    @classmethod
    def normalize_topic(cls, value: str) -> str:
        return (value or "").strip()

    @model_validator(mode="after")
    def validate_by_turn(self) -> ExamSimulatorRequestConfig:
        turn = self.exam_turn
        if turn == "generate":
            if self.question_mix is None:
                raise ValueError("question_mix is required when exam_turn is generate.")
            mix = self.question_mix
            if (mix.mcq + mix.short + mix.long) <= 0:
                raise ValueError("question_mix must contain at least one question.")
            if not self.topic:
                raise ValueError("topic must not be empty.")
            if self.generation_source == "topic_plus_docs" and not self.uploaded_doc_ids:
                raise ValueError(
                    "uploaded_doc_ids must be provided when generation_source is topic_plus_docs."
                )
            if self.generation_source == "topic_only" and self.uploaded_doc_ids:
                raise ValueError("uploaded_doc_ids must be empty when generation_source is topic_only.")
            return self
        if turn in ("save_answer", "submit", "grade", "state"):
            if not self.attempt_id.strip():
                raise ValueError("attempt_id is required for this exam_turn.")
            if turn == "save_answer" and not self.question_id.strip():
                raise ValueError("question_id is required when exam_turn is save_answer.")
            return self
        return self


def validate_exam_simulator_request_config(
    raw_config: dict[str, Any] | None,
) -> ExamSimulatorRequestConfig:
    if not isinstance(raw_config, dict):
        raise ValueError("Exam simulator requires an explicit config object.")
    try:
        return ExamSimulatorRequestConfig.model_validate(raw_config)
    except ValidationError as exc:
        details = "; ".join(
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
            for error in exc.errors()
        )
        raise ValueError(f"Invalid exam simulator config: {details}") from exc


__all__ = [
    "ExamSimulatorQuestionMix",
    "ExamSimulatorRequestConfig",
    "ExamTurn",
    "validate_exam_simulator_request_config",
]
