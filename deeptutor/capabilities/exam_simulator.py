"""Strict timed exam simulator capability (template + attempt lifecycle scaffold)."""

from __future__ import annotations

from deeptutor.agents.exam_simulator.request_config import validate_exam_simulator_request_config
from deeptutor.capabilities.request_contracts import get_capability_request_schema
from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.services.exam_simulator import get_exam_simulator_service


class ExamSimulatorCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="exam_simulator",
        description=(
            "Strict timed exam simulation with mixed question types, "
            "topic/doc-grounded generation, and AI grading."
        ),
        stages=["generation", "delivery", "submission", "grading", "feedback"],
        tools_used=["rag", "reason"],
        cli_aliases=["exam_simulator"],
        request_schema=get_capability_request_schema("exam_simulator"),
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        try:
            cfg = validate_exam_simulator_request_config(context.config_overrides or None)
        except ValueError as exc:
            await stream.error(str(exc), source=self.name, stage="generation")
            return

        service = get_exam_simulator_service()
        user_id = str(
            context.metadata.get("user_id") or context.session_id or "anonymous",
        )

        if cfg.exam_turn == "generate":
            await self._run_generate(cfg, stream, service, user_id)
            return
        if cfg.exam_turn == "save_answer":
            await self._run_save_answer(cfg, stream, service)
            return
        if cfg.exam_turn == "submit":
            await self._run_submit(cfg, stream, service)
            return
        if cfg.exam_turn == "grade":
            await self._run_grade(cfg, stream, service)
            return
        if cfg.exam_turn == "state":
            await self._run_state(cfg, stream, service)
            return

    async def _run_generate(
        self,
        cfg,
        stream: StreamBus,
        service,
        user_id: str,
    ) -> None:
        await stream.progress(
            "Preparing strict exam…",
            source=self.name,
            stage="generation",
        )
        assert cfg.question_mix is not None
        template = service.generate_template(cfg)
        attempt = service.start_attempt(template, user_id)
        payload = service.public_attempt_payload(attempt, template)
        await stream.progress(
            "Exam ready — timer is running.",
            source=self.name,
            stage="delivery",
        )
        await stream.result(
            {
                "response": "Exam simulator started; submit answers before the deadline.",
                "exam_turn": "generate",
                **payload,
            },
            source=self.name,
        )

    async def _run_save_answer(self, cfg, stream: StreamBus, service) -> None:
        attempt_id = cfg.attempt_id.strip()
        question_id = cfg.question_id.strip()
        await stream.progress("Saving answer…", source=self.name, stage="delivery")
        try:
            sub = service.auto_submit_if_deadline_passed(attempt_id)
            attempt = service.get_attempt(attempt_id)
            if attempt is None:
                await stream.error("Unknown attempt_id.", source=self.name, stage="delivery")
                return
            template = service.get_template(attempt.template_id)
            if template is None:
                await stream.error("Exam template missing.", source=self.name, stage="delivery")
                return
            if not sub.skipped:
                summary = service.grade_submitted_attempt(attempt_id)
                await stream.result(
                    {
                        "response": "Time expired; exam was auto-submitted and graded.",
                        "exam_turn": "save_answer",
                        "exam_closed": True,
                        "submit": sub.to_dict(),
                        "grading": summary,
                        **service.public_attempt_payload(
                            attempt, template, include_server_answers=True
                        ),
                    },
                    source=self.name,
                )
                return
            if attempt.status != "started":
                summary = attempt.grading or service.grade_submitted_attempt(attempt_id)
                await stream.result(
                    {
                        "response": "This attempt is no longer active.",
                        "exam_turn": "save_answer",
                        "exam_closed": True,
                        "grading": summary,
                        **service.public_attempt_payload(
                            attempt, template, include_server_answers=True
                        ),
                    },
                    source=self.name,
                )
                return
            service.save_answer(attempt_id, question_id, cfg.answer)
        except KeyError:
            await stream.error("Unknown attempt_id.", source=self.name, stage="delivery")
            return
        except RuntimeError as exc:
            await stream.error(str(exc), source=self.name, stage="delivery")
            return

        attempt = service.get_attempt(attempt_id)
        assert attempt is not None
        template = service.get_template(attempt.template_id)
        assert template is not None
        await stream.result(
            {
                "response": "Answer saved.",
                "exam_turn": "save_answer",
                "saved": True,
                "last_client_seq": cfg.last_client_seq,
                **service.public_attempt_payload(attempt, template, include_server_answers=True),
            },
            source=self.name,
        )

    async def _run_submit(self, cfg, stream: StreamBus, service) -> None:
        attempt_id = cfg.attempt_id.strip()
        await stream.progress("Submitting exam…", source=self.name, stage="submission")
        try:
            service.auto_submit_if_deadline_passed(attempt_id)
            attempt = service.get_attempt(attempt_id)
            if attempt is None:
                await stream.error("Unknown attempt_id.", source=self.name, stage="submission")
                return
            template = service.get_template(attempt.template_id)
            if template is None:
                await stream.error("Exam template missing.", source=self.name, stage="submission")
                return
            if attempt.status == "graded":
                await stream.result(
                    {
                        "response": "Exam already graded.",
                        "exam_turn": "submit",
                        "submit": {"skipped": True, "attempt_id": attempt_id, "status": "graded"},
                        "grading": attempt.grading,
                        **service.public_attempt_payload(
                            attempt, template, include_server_answers=True
                        ),
                    },
                    source=self.name,
                )
                return
            if attempt.status == "submitted":
                summary = service.grade_submitted_attempt(attempt_id)
                await stream.result(
                    {
                        "response": "Exam submitted; grading complete.",
                        "exam_turn": "submit",
                        "submit": {"skipped": True, "attempt_id": attempt_id, "status": "submitted"},
                        "grading": summary,
                        **service.public_attempt_payload(
                            attempt, template, include_server_answers=True
                        ),
                    },
                    source=self.name,
                )
                return
            sub = service.submit_attempt(attempt_id)
            summary = service.grade_submitted_attempt(attempt_id)
            await stream.result(
                {
                    "response": "Exam submitted; grading complete.",
                    "exam_turn": "submit",
                    "submit": sub.to_dict(),
                    "grading": summary,
                    **service.public_attempt_payload(
                        attempt, template, include_server_answers=True
                    ),
                },
                source=self.name,
            )
        except KeyError:
            await stream.error("Unknown attempt_id.", source=self.name, stage="submission")
        except RuntimeError as exc:
            await stream.error(str(exc), source=self.name, stage="submission")

    async def _run_grade(self, cfg, stream: StreamBus, service) -> None:
        attempt_id = cfg.attempt_id.strip()
        await stream.progress("Grading…", source=self.name, stage="grading")
        try:
            attempt = service.get_attempt(attempt_id)
            if attempt is None:
                await stream.error("Unknown attempt_id.", source=self.name, stage="grading")
                return
            template = service.get_template(attempt.template_id)
            if template is None:
                await stream.error("Exam template missing.", source=self.name, stage="grading")
                return
            if attempt.status == "started":
                service.auto_submit_if_deadline_passed(attempt_id)
                attempt = service.get_attempt(attempt_id)
                assert attempt is not None
            if attempt.status == "submitted":
                summary = service.grade_submitted_attempt(attempt_id)
            elif attempt.status == "graded":
                summary = attempt.grading or {}
            else:
                await stream.error(
                    "Cannot grade this attempt in its current state.",
                    source=self.name,
                    stage="grading",
                )
                return
            await stream.result(
                {
                    "response": "Grading result.",
                    "exam_turn": "grade",
                    "grading": summary,
                    **service.public_attempt_payload(
                        attempt, template, include_server_answers=True
                    ),
                },
                source=self.name,
            )
        except KeyError:
            await stream.error("Unknown attempt_id.", source=self.name, stage="grading")
        except RuntimeError as exc:
            await stream.error(str(exc), source=self.name, stage="grading")

    async def _run_state(self, cfg, stream: StreamBus, service) -> None:
        attempt_id = cfg.attempt_id.strip()
        try:
            attempt = service.get_attempt(attempt_id)
            if attempt is None:
                await stream.error("Unknown attempt_id.", source=self.name, stage="delivery")
                return
            template = service.get_template(attempt.template_id)
            if template is None:
                await stream.error("Exam template missing.", source=self.name, stage="delivery")
                return
            service.auto_submit_if_deadline_passed(attempt_id)
            attempt = service.get_attempt(attempt_id)
            assert attempt is not None
            payload = {
                "response": "Exam state sync.",
                "exam_turn": "state",
                **service.public_attempt_payload(attempt, template, include_server_answers=True),
            }
            if attempt.grading is not None:
                payload["grading"] = attempt.grading
            await stream.result(payload, source=self.name)
        except KeyError:
            await stream.error("Unknown attempt_id.", source=self.name, stage="delivery")
