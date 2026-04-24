/** Client-side exam simulator config → unified WS `config` payload. */

import type { MessageRequestSnapshot } from "@/context/UnifiedChatContext";

export type ExamGenerationSource = "topic_only" | "topic_plus_docs";

export interface ExamSimulatorFormValues {
  topic: string;
  durationMinutes: number;
  mcq: number;
  short: number;
  long: number;
  generationSource: ExamGenerationSource;
  /** Comma-separated document IDs when `generationSource` is `topic_plus_docs`. */
  uploadedDocIds: string;
}

export function buildExamSimulatorConfig(values: ExamSimulatorFormValues): Record<string, unknown> {
  const docIds = values.uploadedDocIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    mode: "strict",
    topic: values.topic.trim(),
    duration_minutes: values.durationMinutes,
    question_mix: {
      mcq: values.mcq,
      short: values.short,
      long: values.long,
    },
    generation_source: values.generationSource,
    uploaded_doc_ids: values.generationSource === "topic_plus_docs" ? docIds : [],
  };
}

const EXAM_TOOLS = ["rag", "reason"] as const;

export type ExamQuestionType = "mcq" | "short" | "long";

export interface ExamQuestionPublic {
  question_id: string;
  type: ExamQuestionType;
  prompt: string;
  marks: number;
  options: string[];
}

export interface ExamGradingQuestionRow {
  question_id: string;
  awarded: number;
  max_marks: number;
  feedback: string;
  confidence?: string;
  rubric_breakdown?: unknown[];
}

export interface ExamGradingSummary {
  total: number;
  max_total: number;
  percentage: number;
  questions: ExamGradingQuestionRow[];
}

export interface ExamSessionPayload {
  attempt_id: string;
  template_id: string;
  topic: string;
  deadline_at: number;
  started_at: number;
  question_count: number;
  question_ids: string[];
  generation_source: string;
  questions: ExamQuestionPublic[];
}

function asQuestionList(raw: unknown): ExamQuestionPublic[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ExamQuestionPublic[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const id = typeof o.question_id === "string" ? o.question_id : "";
    const type = o.type === "mcq" || o.type === "short" || o.type === "long" ? o.type : null;
    const prompt = typeof o.prompt === "string" ? o.prompt : "";
    const marks = typeof o.marks === "number" ? o.marks : Number.NaN;
    const options = Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === "string") : [];
    if (!id || !type || !prompt || !Number.isFinite(marks)) return null;
    out.push({ question_id: id, type, prompt, marks, options });
  }
  return out;
}

/** Parse a fresh generate result from WS `result` metadata (not follow-up saves). */
export function parseExamGenerateResult(meta: Record<string, unknown> | null): ExamSessionPayload | null {
  if (!meta) return null;
  const turn = meta.exam_turn;
  if (turn !== undefined && turn !== "generate") return null;
  const questions = asQuestionList(meta.questions);
  if (!questions?.length) return null;
  const attempt_id = typeof meta.attempt_id === "string" ? meta.attempt_id : "";
  const template_id = typeof meta.template_id === "string" ? meta.template_id : "";
  const topic = typeof meta.topic === "string" ? meta.topic : "";
  const deadline_at = typeof meta.deadline_at === "number" ? meta.deadline_at : Number.NaN;
  const started_at = typeof meta.started_at === "number" ? meta.started_at : Number.NaN;
  const question_count = typeof meta.question_count === "number" ? meta.question_count : questions.length;
  if (!attempt_id || !template_id || !Number.isFinite(deadline_at) || !Number.isFinite(started_at)) return null;
  const question_ids = Array.isArray(meta.question_ids)
    ? meta.question_ids.filter((x): x is string => typeof x === "string")
    : questions.map((q) => q.question_id);
  const generation_source = typeof meta.generation_source === "string" ? meta.generation_source : "topic_only";
  return {
    attempt_id,
    template_id,
    topic,
    deadline_at,
    started_at,
    question_count,
    question_ids,
    generation_source,
    questions,
  };
}

export function parseExamGradingSummary(raw: unknown): ExamGradingSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const total = typeof o.total === "number" ? o.total : Number.NaN;
  const max_total = typeof o.max_total === "number" ? o.max_total : Number.NaN;
  const percentage = typeof o.percentage === "number" ? o.percentage : Number.NaN;
  const ql = o.questions;
  if (!Number.isFinite(total) || !Number.isFinite(max_total) || !Number.isFinite(percentage)) return null;
  if (!Array.isArray(ql)) return null;
  const questions: ExamGradingQuestionRow[] = [];
  for (const row of ql) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const question_id = typeof r.question_id === "string" ? r.question_id : "";
    const awarded = typeof r.awarded === "number" ? r.awarded : Number.NaN;
    const max_marks = typeof r.max_marks === "number" ? r.max_marks : Number.NaN;
    const feedback = typeof r.feedback === "string" ? r.feedback : "";
    if (!question_id || !Number.isFinite(awarded) || !Number.isFinite(max_marks)) return null;
    questions.push({
      question_id,
      awarded,
      max_marks,
      feedback,
      confidence: typeof r.confidence === "string" ? r.confidence : undefined,
      rubric_breakdown: Array.isArray(r.rubric_breakdown) ? r.rubric_breakdown : undefined,
    });
  }
  return { total, max_total, percentage, questions };
}

export type ExamFollowupTurn = "save_answer" | "submit" | "grade" | "state";

export function buildExamFollowupConfig(
  turn: ExamFollowupTurn,
  fields: {
    attemptId: string;
    questionId?: string;
    answer?: string;
    lastClientSeq?: number;
  },
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    exam_turn: turn,
    attempt_id: fields.attemptId,
  };
  if (turn === "save_answer") {
    base.question_id = fields.questionId ?? "";
    base.answer = fields.answer ?? "";
    base.last_client_seq = fields.lastClientSeq ?? 0;
  }
  return base;
}

export function buildExamRequestSnapshot(params: {
  language: string;
  config: Record<string, unknown>;
}): MessageRequestSnapshot {
  return {
    content: "",
    capability: "exam_simulator",
    enabledTools: [...EXAM_TOOLS],
    knowledgeBases: [],
    language: params.language,
    config: params.config,
  };
}
