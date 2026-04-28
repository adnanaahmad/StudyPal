# Week 2 Documentation: Full Feature Definition and Implementation Stack

## Project Snapshot

- **Project name:** StudyPal (built on DeepTutor by HKU Data Intelligence Lab)
- **Team:** x-fast
- **Team members:** Adnan Ahmad (Lead), Bismah Babar
- **Meeting objective:** Review idea with manager and refine approach into a buildable roadmap

## Problem Statement (Refined)

Students and self-learners use static resources (textbooks, PDFs, notes) that do not adapt to their pace, knowledge gaps, or goals. Existing tools are either generic chat assistants or isolated learning apps. We need one practical AI learning workspace that can teach, test, explain, and guide research from the learner's own content.

## Build Scope (Week 2 Definition)

StudyPal is a unified learning product built on DeepTutor with the following core features:

1. Chat
2. TutorBot
3. Voice Agent
4. Co-Writer
5. Guided Learning
6. Whiteboard
7. Mindmap
8. Podcasts
9. Exam Simulator
10. Knowledge
11. Memory

## Feature Definitions (All Features)

### 1) Chat
- **Purpose:** Main learning conversation interface with grounded answers.
- **User value:** Ask any question and get contextual responses with optional citations/tools.
- **Inputs:** User prompt, selected tools, optional knowledge base.
- **Outputs:** Explanations, references, code/math reasoning, next-step suggestions.
- **Status in product:** Core and active.

### 2) TutorBot
- **Purpose:** Persistent personalized tutor instances with their own persona and memory.
- **User value:** A tutor that follows long-term goals, reminders, and preferred learning style.
- **Inputs:** Persona settings, session context, user interactions.
- **Outputs:** Adaptive tutoring, proactive nudges, personalized coaching.
- **Status in product:** Core and active.

### 3) Voice Agent
- **Purpose:** Conversational voice interface for spoken tutoring sessions.
- **User value:** Hands-free learning and spoken explanations for accessibility and speed.
- **Inputs:** Microphone audio, user commands/questions.
- **Outputs:** Transcribed understanding + spoken/text AI responses.
- **Status in product:** Planned/iterative rollout.

### 4) Co-Writer
- **Purpose:** AI-assisted writing editor for notes, summaries, and reports.
- **User value:** Rewrite, expand, shorten, and structure content quickly with learning context.
- **Inputs:** Selected text, writing goal, optional knowledge/web context.
- **Outputs:** Improved markdown content and study notes.
- **Status in product:** Core and active.

### 5) Guided Learning
- **Purpose:** Creates structured multi-step learning plans from user topics/material.
- **User value:** Converts complex subjects into manageable progression.
- **Inputs:** Learning topic, optional notebook/knowledge references.
- **Outputs:** Step-by-step curriculum pages and guided checkpoints.
- **Status in product:** Core and active.

### 6) Whiteboard
- **Purpose:** Visual thinking and explanation canvas for concepts/problem solving.
- **User value:** Understand difficult ideas via diagrams, flow sketches, and spatial reasoning.
- **Inputs:** User topic/problem and whiteboard interactions.
- **Outputs:** Visual learning artifacts linked to discussion.
- **Status in product:** Planned/experimental enhancement.

### 7) Mindmap
- **Purpose:** Auto-structured concept maps from topics or uploaded material.
- **User value:** Quickly see topic hierarchy, dependencies, and revision paths.
- **Inputs:** Topic prompt, extracted key concepts from content.
- **Outputs:** Node-link concept map for revision and exploration.
- **Status in product:** Planned/experimental enhancement.

### 8) Podcasts
- **Purpose:** Generate audio-style lesson summaries or revision briefs.
- **User value:** Learn while commuting and reinforce concepts through listening.
- **Inputs:** Topic/chapter/content summary request.
- **Outputs:** Scripted educational audio format (or TTS-ready script).
- **Status in product:** Planned.

### 9) Exam Simulator
- **Purpose:** Simulated test sessions with evaluation and feedback.
- **User value:** Practice under exam-like constraints and identify weak areas.
- **Inputs:** Topic scope, difficulty, question count/time limit.
- **Outputs:** Exam set, answers/evaluation, targeted feedback.
- **Status in product:** Designed and implementation-tracked.

### 10) Knowledge
- **Purpose:** Ingest and index learner materials (PDF/TXT/Markdown) for retrieval.
- **User value:** Makes AI answers and quiz generation grounded in user-owned resources.
- **Inputs:** Documents, metadata, retrieval settings.
- **Outputs:** Searchable/indexed knowledge base and citation sources.
- **Status in product:** Core and active.

### 11) Memory
- **Purpose:** Long-term learner profile and learning-history retention.
- **User value:** Increasingly personalized support over time.
- **Inputs:** Session history, preferences, progress signals.
- **Outputs:** Learner summary/profile used by multiple features.
- **Status in product:** Core and active.

## Libraries and Techniques Used

### Platform-Wide Stack
- **Backend framework:** FastAPI (Python service and API routing)
- **Frontend framework:** Next.js 16 + React 19
- **AI orchestration pattern:** Agent-native two-layer model (Tools + Capabilities)
- **LLM provider integration:** Native OpenAI/Anthropic-style provider adapters (plus compatible backends)
- **Knowledge/RAG layer:** LlamaIndex-based indexing/retrieval with pluggable pipelines
- **Data modeling/config:** Pydantic and settings-driven environment configuration
- **CLI/runtime:** Typer CLI + unified orchestrator for CLI/Web/SDK

### Feature-to-Implementation Mapping

#### Chat
- **Libraries/components:** FastAPI WebSocket routing, React chat UI, provider adapters.
- **Techniques:** Tool-augmented prompting, context window management, optional RAG grounding.

#### TutorBot
- **Libraries/components:** nanobot integration, persistent workspace/session management.
- **Techniques:** Multi-instance agent loops, persona templates, proactive heartbeat/reminders.

#### Voice Agent
- **Libraries/components:** Speech-to-text/text-to-speech integration points, realtime stream handling.
- **Techniques:** Audio chunking, low-latency transcription, turn-taking orchestration.

#### Co-Writer
- **Libraries/components:** Markdown editor UI + AI action pipeline.
- **Techniques:** Context-aware rewrite/expand/shorten transformations with optional KB/web grounding.

#### Guided Learning
- **Libraries/components:** Guided-learning capability pipeline + interactive page rendering.
- **Techniques:** Topic decomposition, staged progression, contextual Q&A per learning step.

#### Whiteboard
- **Libraries/components:** Frontend canvas/diagram components (integrated into app surface).
- **Techniques:** Visual-first explanation workflows and synchronized narrative + drawing.

#### Mindmap
- **Libraries/components:** Graph rendering layer in frontend.
- **Techniques:** Concept extraction, hierarchy building, relation graph generation.

#### Podcasts
- **Libraries/components:** Content-to-script generation + optional TTS bridge.
- **Techniques:** Summarization-to-narrative conversion, chapter chunking, style-controlled generation.

#### Exam Simulator
- **Libraries/components:** Deep question/exam generation flows and validation logic.
- **Techniques:** Difficulty calibration, rubric-based scoring, targeted remediation feedback.

#### Knowledge
- **Libraries/components:** Upload pipeline, parsers, index storage, retrieval engine.
- **Techniques:** RAG chunking/indexing, citation tracing, incremental document ingestion.

#### Memory
- **Libraries/components:** Runtime memory store (summary + profile dimensions).
- **Techniques:** Cross-session memory updates, personalization signals, profile-guided responses.

## End-to-End User Flow (Unified)

1. User uploads study material into Knowledge.
2. User interacts in Chat for grounded explanations.
3. User uses Co-Writer for note/reflection quality.
4. User follows Guided Learning for structured progression.
5. User explores difficult ideas via Whiteboard/Mindmap.
6. User revises through Podcasts and Exam Simulator.
7. TutorBot + Memory continuously personalize future sessions.

## Required Inputs, Tools, and Team Alignment

### Required Inputs
- Learning documents (PDF/TXT/Markdown)
- User goals (exam prep, revision, research exploration)
- User interactions (chat, writing, quiz attempts, feedback)

### Required Tooling
- LLM provider configuration
- Embedding + retrieval stack (RAG)
- Web frontend and API backend runtime
- Optional local model/runtime support for low-cost use

### Team Responsibilities
- **Adnan (Lead):** Scope, architecture, backend integration, manager/mentor communication.
- **Bismah:** Frontend flows, UX polish, testing scenarios, demo storytelling.
- **Shared ownership:** Prompt quality, feature QA, and iteration from review feedback.

## Week 1 Section (Requested): Idea Refinement

### Idea Refinement — Define a clear, buildable idea

- Finalize problem and solution scope.
- Define how AI will be used (core, not optional).
- Outline end-to-end flow and required tools.

### Refined Problem Statement (Specific and Practical)

Self-learners need an affordable AI tutor that works directly on their own study material, supports understanding plus assessment, and improves over time through memory.

### Finalized Build Scope (Focused)

- Build one integrated learner journey around Chat, TutorBot, Knowledge, Memory, Co-Writer, Guided Learning, and exam/revision tools.
- Deliver advanced visual/audio modules (Whiteboard, Mindmap, Podcasts, Voice Agent) in phased iterations.

### How AI Is Used (Core, Not Optional)

AI powers every key workflow:
- source-grounded tutoring and explanation,
- adaptive quiz/exam generation and evaluation,
- writing assistance and learning-plan generation,
- proactive personalized support through tutor agents and memory.

### Simple End-to-End Solution Flow

Upload content -> grounded learning chat -> guided plan -> write/revise notes -> practice exams/quizzes -> visual/audio revision -> long-term personalization through tutor memory.

### Identify Required Data Inputs and Tools

- Inputs: documents, learner goals, interactive performance signals.
- Tools: RAG stack, LLM reasoning/generation, session memory, UI modules, optional local model runtimes.

### Align Team Responsibilities

- Architecture/backend ownership, frontend/UX ownership, and shared validation loop are defined.
- Weekly review checkpoints with mentor/manager are part of the execution plan.

### Review and Outcome

Approach will be reviewed with mentor/manager and refined into implementation priorities.

**Outcome: Clear problem, defined solution, and build-ready feature roadmap.**
