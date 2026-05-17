"""Shared data models for the math animator pipeline."""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _normalize_list_strings(v: Any) -> list[str]:
    """Helper to normalize a list of strings, handling cases where LLM returns dicts."""
    if isinstance(v, dict):
        # Handle case where LLM returns a dict instead of a list
        normalized = []
        for k, val in v.items():
            if isinstance(val, (str, int, float)):
                normalized.append(f"{k}: {val}")
            else:
                normalized.append(f"{k}: {json.dumps(val, ensure_ascii=False)}")
        return normalized

    if not isinstance(v, list):
        if v is None:
            return []
        return [str(v)]

    normalized = []
    for item in v:
        if isinstance(item, str):
            normalized.append(item)
        elif isinstance(item, dict):
            if len(item) == 1:
                k, val = list(item.items())[0]
                normalized.append(f"{k}: {val}")
            else:
                normalized.append(json.dumps(item, ensure_ascii=False))
        else:
            normalized.append(str(item))
    return normalized


class ConceptAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    learning_goal: str = ""
    math_focus: list[str] = Field(default_factory=list)
    visual_targets: list[str] = Field(default_factory=list)
    narrative_steps: list[str] = Field(default_factory=list)
    reference_usage: str = ""
    output_intent: str = ""

    @field_validator("math_focus", "visual_targets", "narrative_steps", mode="before")
    @classmethod
    def normalize_lists(cls, v: Any) -> list[str]:
        return _normalize_list_strings(v)


class SceneDesign(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = ""
    scene_outline: list[str] = Field(default_factory=list)
    visual_style: str = ""
    animation_notes: list[str] = Field(default_factory=list)
    image_plan: list[str] = Field(default_factory=list)
    code_constraints: list[str] = Field(default_factory=list)

    @field_validator(
        "scene_outline",
        "animation_notes",
        "image_plan",
        "code_constraints",
        mode="before",
    )
    @classmethod
    def normalize_lists(cls, v: Any) -> list[str]:
        return _normalize_list_strings(v)


class GeneratedCode(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str = ""
    rationale: str = ""


class SummaryPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    summary_text: str = ""
    user_request: str = ""
    generated_output: str = ""
    key_points: list[str] = Field(default_factory=list)

    @field_validator("key_points", mode="before")
    @classmethod
    def normalize_lists(cls, v: Any) -> list[str]:
        return _normalize_list_strings(v)


class RenderedArtifact(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: str
    url: str
    filename: str
    content_type: str = ""
    label: str = ""


class RetryAttempt(BaseModel):
    model_config = ConfigDict(extra="ignore")

    attempt: int
    error: str


class VisualReviewResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    passed: bool = True
    summary: str = ""
    issues: list[str] = Field(default_factory=list)
    suggested_fix: str = ""
    reviewed_frames: int = 0


class RenderResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    output_mode: str
    artifacts: list[RenderedArtifact] = Field(default_factory=list)
    public_code_path: str = ""
    source_code_path: str = ""
    quality: str = ""
    retry_attempts: int = 0
    retry_history: list[RetryAttempt] = Field(default_factory=list)
    visual_review: VisualReviewResult | None = None


__all__ = [
    "ConceptAnalysis",
    "GeneratedCode",
    "RenderResult",
    "RenderedArtifact",
    "RetryAttempt",
    "SceneDesign",
    "SummaryPayload",
    "VisualReviewResult",
]
