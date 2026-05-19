import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { NextRequest } from "next/server";

// Ollama exposes an OpenAI-compatible API at /v1. We point the OpenAI SDK at it
// instead of api.openai.com and pass any non-empty key (Ollama ignores it).
//
// Override via env:
//   OLLAMA_BASE_URL  - default http://localhost:11434/v1
//   COPILOT_MODEL    - default qwen2.5:7b
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const COPILOT_MODEL = process.env.COPILOT_MODEL ?? "gemma4";

const openai = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: "ollama",
});

const runtime = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const referer = req.headers.get("referer");
  const useQwen = referer?.includes("/mindmap") || referer?.includes("/podcasts") || referer?.includes("/decks") || referer?.includes("/co-writer");
  const model = useQwen ? "qwen2.5:7b" : COPILOT_MODEL;

  const serviceAdapter = new OpenAIAdapter({
    openai,
    model,
    // Sequential tool calls keep state mutations visible to the next call —
    // important for the mindmap where add_node order matters.
    disableParallelToolCalls: true,
    keepSystemRole: true,
  });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};

export const GET = POST;
