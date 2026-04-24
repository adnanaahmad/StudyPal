# Exam Simulator v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a strict, timed exam simulator capability with mixed question types, topic/doc-grounded generation, auto-submit on timeout, AI grading, and basic integrity event logging.

**Architecture:** Implement a dedicated backend capability (`exam_simulator`) with explicit request config validation and test coverage, then integrate it into runtime bootstrap and the workspace UI capability picker. Reuse unified WS transport (`start_turn`) with structured capability config, and introduce a focused frontend config builder for strict exam mode.

**Tech Stack:** Python (FastAPI runtime + Pydantic + pytest), TypeScript/React (Next.js App Router), unified WebSocket client/context.

---

### Task 1: Add backend exam request contract + schema registration

**Files:**
- Create: `deeptutor/agents/exam_simulator/request_config.py`
- Modify: `deeptutor/capabilities/request_contracts.py`
- Test: `tests/agents/exam_simulator/test_request_config.py`

- [ ] **Step 1: Write the failing request-config tests**

```python
from deeptutor.agents.exam_simulator.request_config import validate_exam_simulator_request_config


def test_exam_request_accepts_topic_only():
    cfg = validate_exam_simulator_request_config(
        {
            "mode": "strict",
            "topic": "Thermodynamics",
            "duration_minutes": 60,
            "question_mix": {"mcq": 10, "short": 3, "long": 2},
            "generation_source": "topic_only",
        }
    )
    assert cfg.mode == "strict"
    assert cfg.generation_source == "topic_only"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/agents/exam_simulator/test_request_config.py -v`  
Expected: FAIL with module import error for `exam_simulator.request_config`.

- [ ] **Step 3: Add minimal request config model and validator**

```python
class ExamSimulatorRequestConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["strict"] = "strict"
    topic: str = Field(min_length=1)
    duration_minutes: int = Field(ge=5, le=240)
    question_mix: ExamQuestionMix
    generation_source: Literal["topic_only", "topic_plus_docs"] = "topic_only"
    uploaded_doc_ids: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: Register validator + schema in capability request contracts**

```python
CAPABILITY_CONFIG_VALIDATORS["exam_simulator"] = validate_exam_simulator_request_config
CAPABILITY_REQUEST_SCHEMAS["exam_simulator"] = build_request_schema(ExamSimulatorRequestConfig)
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pytest tests/agents/exam_simulator/test_request_config.py tests/core/test_capabilities_runtime.py -v`  
Expected: PASS, including schema/validator access for `exam_simulator`.

- [ ] **Step 6: Commit**

```bash
git add deeptutor/agents/exam_simulator/request_config.py deeptutor/capabilities/request_contracts.py tests/agents/exam_simulator/test_request_config.py
git commit -m "feat: add exam simulator request contract and schema validation"
```

### Task 2: Add exam simulator capability + runtime registration

**Files:**
- Create: `deeptutor/capabilities/exam_simulator.py`
- Modify: `deeptutor/runtime/bootstrap/builtin_capabilities.py`
- Modify: `deeptutor/capabilities/__init__.py`
- Test: `tests/core/test_capabilities_runtime.py`

- [ ] **Step 1: Add failing runtime test for new capability manifest + stream result**

```python
from deeptutor.capabilities.exam_simulator import ExamSimulatorCapability


@pytest.mark.asyncio
async def test_exam_simulator_capability_streams_result(monkeypatch):
    capability = ExamSimulatorCapability()
    assert capability.manifest.name == "exam_simulator"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/core/test_capabilities_runtime.py::test_exam_simulator_capability_streams_result -v`  
Expected: FAIL because capability module/class does not exist.

- [ ] **Step 3: Implement minimal capability with strict lifecycle stages**

```python
class ExamSimulatorCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="exam_simulator",
        description="Strict timed exam simulation with mixed question generation and AI grading.",
        stages=["generation", "delivery", "submission", "grading", "feedback"],
        tools_used=["rag", "reason"],
        cli_aliases=["exam_simulator"],
        request_schema=get_capability_request_schema("exam_simulator"),
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        await stream.progress("Preparing strict exam...", source=self.name, stage="generation")
        await stream.result({"response": "Exam simulator pipeline scaffolded."}, source=self.name, stage="feedback")
```

- [ ] **Step 4: Register built-in capability and export**

```python
BUILTIN_CAPABILITY_CLASSES["exam_simulator"] = "deeptutor.capabilities.exam_simulator:ExamSimulatorCapability"
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pytest tests/core/test_capabilities_runtime.py -v`  
Expected: PASS for new capability runtime test and no regressions in existing capability tests.

- [ ] **Step 6: Commit**

```bash
git add deeptutor/capabilities/exam_simulator.py deeptutor/runtime/bootstrap/builtin_capabilities.py deeptutor/capabilities/__init__.py tests/core/test_capabilities_runtime.py
git commit -m "feat: register exam simulator capability in unified runtime"
```

### Task 3: Implement backend strict exam pipeline service + timeout auto-submit

**Files:**
- Create: `deeptutor/services/exam_simulator/service.py`
- Create: `deeptutor/services/exam_simulator/models.py`
- Modify: `deeptutor/capabilities/exam_simulator.py`
- Test: `tests/services/exam_simulator/test_service.py`

- [ ] **Step 1: Add failing service tests for timer and auto-submit**

```python
async def test_auto_submit_marks_unanswered_zero(service):
    template = await service.generate_template(
        topic="Thermodynamics",
        duration_minutes=30,
        question_mix={"mcq": 2, "short": 1, "long": 1},
        generation_source="topic_only",
        uploaded_doc_ids=[],
    )
    attempt = await service.start_attempt(template=template, user_id="user-1")
    await service.save_answer(attempt.id, "q1", "B")
    result = await service.auto_submit_if_deadline_passed(attempt.id, now=attempt.deadline_at + 1)
    assert result.auto_submitted is True
    assert result.unanswered_count > 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/services/exam_simulator/test_service.py -v`  
Expected: FAIL due to missing service/model implementation.

- [ ] **Step 3: Implement service models and strict attempt logic**

```python
@dataclass
class ExamAttemptState:
    attempt_id: str
    started_at: float
    deadline_at: float
    auto_submitted: bool = False
```

```python
async def auto_submit_if_deadline_passed(self, attempt_id: str, now: float) -> SubmitResult:
    attempt = self._get_attempt(attempt_id)
    if now < attempt.deadline_at or attempt.status in {"submitted", "graded"}:
        return SubmitResult(skipped=True)
    return await self.submit_attempt(attempt_id=attempt_id, auto_submitted=True)
```

- [ ] **Step 4: Wire capability to call service lifecycle**

```python
service = ExamSimulatorService(clock=time.time)
template = await service.generate_template(config, context)
attempt = await service.start_attempt(template=template, user_id=context.user_id or "anonymous")
await stream.result({"response": service.format_attempt_payload(attempt)}, source=self.name, stage="delivery")
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pytest tests/services/exam_simulator/test_service.py tests/core/test_capabilities_runtime.py -v`  
Expected: PASS for strict deadline + auto-submit behavior and capability integration.

- [ ] **Step 6: Commit**

```bash
git add deeptutor/services/exam_simulator/models.py deeptutor/services/exam_simulator/service.py deeptutor/capabilities/exam_simulator.py tests/services/exam_simulator/test_service.py
git commit -m "feat: implement strict exam lifecycle with auto-submit service"
```

### Task 4: Add grading pipeline for MCQ + short/long rubric scoring

**Files:**
- Modify: `deeptutor/services/exam_simulator/service.py`
- Create: `deeptutor/services/exam_simulator/grading.py`
- Test: `tests/services/exam_simulator/test_grading.py`

- [ ] **Step 1: Add failing grading tests**

```python
def test_mcq_grading_is_deterministic(grader):
    score = grader.grade_mcq(user_answer="B", correct_answer="B", marks=2)
    assert score.awarded == 2


def test_written_grading_is_bounded(grader):
    rubric = [
        {"criterion": "correct concept", "weight": 2},
        {"criterion": "clarity", "weight": 2},
        {"criterion": "example quality", "weight": 1},
    ]
    out = grader.grade_written("Entropy increases in isolated systems.", rubric=rubric, max_marks=5)
    assert 0 <= out.awarded <= 5
    assert out.feedback
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/services/exam_simulator/test_grading.py -v`  
Expected: FAIL with missing grading module/functions.

- [ ] **Step 3: Implement deterministic MCQ + rubric-constrained written scoring**

```python
def grade_mcq(user_answer: str, correct_answer: str, marks: int) -> QuestionGrade:
    return QuestionGrade(awarded=marks if user_answer == correct_answer else 0, confidence="high")
```

```python
def clamp_score(raw: float, max_marks: int) -> int:
    return max(0, min(max_marks, int(round(raw))))
```

- [ ] **Step 4: Add aggregate attempt report builder**

```python
def build_attempt_summary(question_grades: list[QuestionGrade]) -> AttemptSummary:
    total = sum(g.awarded for g in question_grades)
    max_total = sum(g.max_marks for g in question_grades)
    return AttemptSummary(total=total, percentage=(100 * total / max_total if max_total else 0))
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pytest tests/services/exam_simulator/test_grading.py tests/services/exam_simulator/test_service.py -v`  
Expected: PASS with bounded written scores and deterministic MCQ scoring.

- [ ] **Step 6: Commit**

```bash
git add deeptutor/services/exam_simulator/grading.py deeptutor/services/exam_simulator/service.py tests/services/exam_simulator/test_grading.py
git commit -m "feat: add exam simulator grading pipeline and summary output"
```

### Task 5: Add frontend exam simulator config + capability option in workspace

**Files:**
- Create: `web/lib/exam-simulator-types.ts`
- Modify: `web/app/(workspace)/page.tsx`
- Modify: `web/context/UnifiedChatContext.tsx`
- Test: `web/tests/exam-simulator.spec.ts` (or existing audit project equivalent)

- [ ] **Step 1: Add failing frontend/unit tests for config payload builder**

```typescript
import { buildExamSimulatorWSConfig } from "@/lib/exam-simulator-types";

it("builds strict topic_plus_docs payload", () => {
  const cfg = buildExamSimulatorWSConfig({ mode: "strict", topic: "Algebra", generationSource: "topic_plus_docs" });
  expect(cfg.mode).toBe("strict");
  expect(cfg.generation_source).toBe("topic_plus_docs");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npm run lint`  
Expected: FAIL until new module and imports are added.

- [ ] **Step 3: Implement exam config builder/types**

```typescript
export interface ExamSimulatorFormConfig {
  mode: "strict";
  topic: string;
  durationMinutes: number;
  generationSource: "topic_only" | "topic_plus_docs";
  questionMix: { mcq: number; short: number; long: number };
}
```

```typescript
export function buildExamSimulatorWSConfig(input: ExamSimulatorFormConfig): Record<string, unknown> {
  return {
    mode: input.mode,
    topic: input.topic,
    duration_minutes: input.durationMinutes,
    generation_source: input.generationSource,
    question_mix: input.questionMix,
  };
}
```

- [ ] **Step 4: Add capability entry and send config via existing start_turn flow**

```typescript
{
  value: "exam_simulator",
  label: "Exam Simulator",
  description: "Strict timed exam simulation with auto-submit",
  icon: BrainCircuit,
  allowedTools: ["rag", "reason"],
  defaultTools: ["rag", "reason"],
}
```

- [ ] **Step 5: Run frontend checks to verify pass**

Run: `cd web && npm run lint && npm run i18n:check`  
Expected: PASS with new capability wiring and no lint/i18n regressions.

- [ ] **Step 6: Commit**

```bash
git add web/lib/exam-simulator-types.ts web/app/(workspace)/page.tsx web/context/UnifiedChatContext.tsx web/tests/exam-simulator.spec.ts
git commit -m "feat: add exam simulator capability config to workspace UI"
```

### Task 6: Add integration tests for unified WS exam capability flow

**Files:**
- Modify: `tests/api/test_unified_ws_turn_runtime.py`
- Modify: `tests/services/session/test_sqlite_store.py`
- Test: `tests/api/test_unified_ws_turn_runtime.py`

- [ ] **Step 1: Add failing integration test for exam turn startup and config validation**

```python
async def test_unified_ws_start_turn_exam_simulator_rejects_invalid_config(test_client):
    payload = {"type": "start_turn", "capability": "exam_simulator", "config": {"duration_minutes": 1}}
    event = await send_ws_and_read_terminal_event(test_client, payload)
    assert event["type"] == "error"
    assert "Invalid" in event["content"]
```

- [ ] **Step 2: Run the specific integration test to confirm failure**

Run: `pytest tests/api/test_unified_ws_turn_runtime.py -k exam_simulator -v`  
Expected: FAIL until capability and validator are fully wired in the runtime path.

- [ ] **Step 3: Add happy-path exam capability WS flow test**

```python
async def test_unified_ws_start_turn_exam_simulator_success(test_client):
    payload = {
        "type": "start_turn",
        "content": "start strict exam",
        "capability": "exam_simulator",
        "config": {"mode": "strict", "topic": "Calculus", "duration_minutes": 45, "question_mix": {"mcq": 8, "short": 2, "long": 1}},
    }
    events = await send_ws_and_collect_events(test_client, payload)
    assert any(e["type"] == "session" for e in events)
    assert any(e["type"] == "result" for e in events)
    assert events[-1]["type"] == "done"
```

- [ ] **Step 4: Verify session persistence captures exam capability metadata**

```python
assert turn["capability"] == "exam_simulator"
assert session["preferences"]["capability"] == "exam_simulator"
```

- [ ] **Step 5: Run full backend verification**

Run: `pytest tests/api/test_unified_ws_turn_runtime.py tests/core/test_capabilities_runtime.py tests/services/exam_simulator -v`  
Expected: PASS for exam runtime contract, capability flow, and service/grading modules.

- [ ] **Step 6: Commit**

```bash
git add tests/api/test_unified_ws_turn_runtime.py tests/services/session/test_sqlite_store.py
git commit -m "test: cover exam simulator unified websocket runtime flow"
```

### Task 7: Final quality gate + docs update

**Files:**
- Create: `docs/features/exam-simulator-v1.md`
- Modify: `docs/superpowers/specs/2026-04-24-exam-simulator-design.md` (only if implementation deviates)
- Test: Backend + frontend verification commands

- [ ] **Step 1: Run backend quality checks**

Run: `ruff check . && ruff format . && pytest`  
Expected: PASS with no new lint/test failures.

- [ ] **Step 2: Run frontend quality checks**

Run: `cd web && npm run lint && npm run i18n:check`  
Expected: PASS.

- [ ] **Step 3: (Optional) Run UI audit if exam UI route is included in existing flows**

Run: `cd web && npm run audit`  
Expected: PASS for existing scenarios; document any non-blocking unrelated failures.

- [ ] **Step 4: Update feature docs with user-facing notes**

```markdown
## Exam Simulator (v1)
- Strict mode only
- Mixed question types
- Auto-submit on timeout
- AI grading with rubric feedback
```

- [ ] **Step 5: Commit**

```bash
git add docs/features docs/superpowers/specs/2026-04-24-exam-simulator-design.md
git commit -m "docs: document exam simulator v1 behavior and rollout notes"
```
