# Exam Simulator v1 Design

## Overview

DeepTutor will add a strict exam simulator focused on realistic timed assessments with mixed question types. The feature is implemented as a dedicated capability and integrated into the existing unified runtime and frontend workspace. v1 supports two generation paths: topic-only, and topic plus uploaded documents.

## Goals

- Provide a strict-mode exam experience with hard timing and auto-submit.
- Support mixed question types: MCQ, short answer, and long answer.
- Generate exams from user-provided topic/syllabus, optionally grounded in uploaded materials.
- Auto-grade all question types using AI-based evaluation.
- Record basic integrity signals (fullscreen exits, tab switches) without hard disqualification.
- Return structured results with rubric-based feedback and topic-level improvement guidance.

## Non-Goals (v1)

- Adaptive difficulty changes during an active exam.
- Practice mode or hint-enabled learning mode.
- Teacher/manual grading workflows.
- Webcam or advanced remote proctoring.
- Hard anti-cheat enforcement beyond warning + event logging.

## Architecture

### Capability Model

Implement a new built-in capability: `exam_simulator`.

Lifecycle stages:

1. `generation`
2. `delivery`
3. `submission`
4. `grading`
5. `feedback`

This capability remains isolated from the default chat flow so strict exam invariants (timer lock, auto-submit, answer-key privacy) are easier to guarantee.

### Generation Strategy

Two supported inputs:

1. Topic/syllabus only (`topic_only`)
2. Topic/syllabus plus uploaded documents (`topic_plus_docs`)

Priority rule:

- If docs are provided, generate doc-grounded questions first.
- Fill uncovered blueprint areas using topic-based generation.

### Strict Runtime Rules

- Server sets immutable `started_at` and `deadline_at`.
- Server is source of truth for timer state.
- On timeout, server auto-submits all attempted answers.
- Unanswered questions receive zero marks.
- Answer key and model answers are hidden during active attempts.

### Grading

- MCQ: deterministic exact scoring.
- Short/Long: rubric-constrained LLM scoring with bounded marks.
- Output includes score, explanation, rubric breakdown, and confidence.

### Integrity Signals (Basic)

- Frontend emits events for tab blur/focus and fullscreen exits.
- Backend stores integrity incidents on the attempt record.
- v1 uses signals for transparency only; no automatic disqualification.

## Data Model

### ExamTemplate

- `id`
- `title`
- `topic`
- `duration_minutes`
- `difficulty`
- `question_mix` (mcq/short/long counts)
- `generation_source` (`topic_only` or `topic_plus_docs`)
- `questions` (prompt + metadata)
- `answer_key` (server-only during active attempts)
- `rubrics` (short/long scoring criteria)

### ExamAttempt

- `attempt_id`
- `template_id`
- `user_id`
- `status` (`created|started|submitted|graded|expired`)
- `started_at`
- `deadline_at`
- `submitted_at`
- `auto_submitted` (bool)
- `integrity_events` (warnings/logs)
- `final_score`
- `section_scores`

### Question Schema

Common fields:

- `question_id`
- `type` (`mcq|short|long`)
- `prompt`
- `marks`
- `topic_tag`

MCQ fields:

- `options[]`
- `single_correct`

Short/Long fields:

- `expected_points[]`
- `rubric[]`
- `model_answer` (hidden until grading view)

### Answer Schema

- `question_id`
- `response`
- `saved_at`
- `last_client_seq`

### Grading Schema

- `question_score`
- `max_score`
- `feedback`
- `confidence`
- `rubric_breakdown`

Attempt summary:

- `total`
- `percentage`
- strengths
- weaknesses
- revision suggestions

## API / Event Contract

Add exam-specific actions to unified runtime transport:

- `exam.create`
  - input: topic, optional document references, duration, difficulty, question mix
  - output: template metadata and generated exam package
- `exam.start`
  - starts strict attempt and locks timer fields
- `exam.answer.save`
  - incremental answer persistence (autosave-friendly)
- `exam.integrity.event`
  - logs client-side integrity warnings
- `exam.submit`
  - manual submit
- `exam.auto_submit`
  - server-initiated at deadline
- `exam.grade`
  - grading pipeline trigger after submit
- `exam.result.get`
  - fetch graded report

## Frontend UX

### Entry

- Choose generation source:
  - topic only
  - topic + uploaded docs
- Configure duration, difficulty, and question mix.
- Generate exam and show brief exam metadata.
- Start strict exam.

### Strict Exam Screen

- Fullscreen recommendation prompt before exam start.
- Persistent countdown using server-authoritative deadline.
- Question navigator with answered/unanswered state.
- One-question focus pane:
  - MCQ via radios
  - short/long via textareas
- Autosave status indicator.

### Integrity UX

- On tab switch/window blur: show warning banner and log event.
- On fullscreen exit: show warning with return-to-fullscreen CTA and log event.
- No disqualification in v1; events appear in attempt record.

### Submit + Timeout

- Manual submit with confirmation modal.
- Timeout behavior:
  - lock editing immediately
  - auto-submit attempted answers
  - unanswered scored zero
  - transition to grading state

### Results

- Total score and section-wise breakdown.
- Per-question rubric feedback.
- Confidence signal per scored response.
- Topic-level improvement recommendations.

### Resilience

- Handle temporary network drop with retry queue for saves.
- Reconnect flow reconciles answers by latest server-approved sequence/timestamp.
- If grading is delayed, show polling-based "grading in progress" state.

## Testing Strategy

### Backend (pytest)

- Generation tests:
  - topic-only produces valid mixed set
  - topic+docs prioritizes doc-grounded content, then fills topic gaps
- Timing tests:
  - `exam.start` sets immutable deadline
  - timeout path triggers auto-submit correctly
- Submission tests:
  - attempted answers are persisted
  - unanswered are treated as zero at grading
- Grading tests:
  - MCQ deterministic scoring
  - short/long rubric output stays within mark bounds and schema
- Integrity tests:
  - blur/fullscreen events are persisted and linked to attempt

### Frontend

- End-to-end strict exam journey:
  - create -> start -> answer -> autosave -> submit
- Timeout auto-submit flow.
- Warning banners for blur/fullscreen events.
- Result rendering for total + section + per-question feedback.

### Contract / Integration

- Validate `exam.*` transport contract compatibility.
- Reconnect autosave merge behavior uses latest answer state deterministically.

## Security and Reliability Considerations

- Do not expose answer key to client during active attempts.
- Keep grading output schema-constrained to reduce free-form hallucinated scoring.
- Treat uploaded docs as untrusted source text; do not execute embedded instructions.
- Log all auto-submit and integrity events for auditability.

## Rollout Plan

### Phase 1 (Internal Flag)

- Guard with `exam_simulator_v1` feature flag.
- Internal testing with known benchmark prompts/papers.

### Phase 2 (Beta)

- Limited user rollout.
- Collect telemetry:
  - completion rate
  - timeout rate
  - grading latency
  - integrity event frequency

### Phase 3 (General Availability)

- Release broadly after evaluating:
  - score consistency trends
  - feedback usefulness ratings
  - reliability under load

## Success Metrics (v1)

- Exam completion rate.
- Average grading latency.
- Regrade disagreement rate (spot checks).
- Integrity event frequency per attempt.
- User-rated usefulness of feedback.

