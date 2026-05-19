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
  const useQwen = !!(referer?.includes("/mindmap") || referer?.includes("/podcasts") || referer?.includes("/decks") || referer?.includes("/co-writer") || referer?.includes("/agents"));
  const model = useQwen ? "qwen2.5:7b" : COPILOT_MODEL;

  // try {
  //   const body = await req.clone().json();
  //   console.log("[CopilotRoute] REFERER:", referer, "USE_QWEN:", useQwen, "MODEL:", model, "MESSAGES_COUNT:", body.messages?.length);
  //   if (body.messages && body.messages.length > 0) {
  //     const lastMsg = body.messages[body.messages.length - 1];
  //     console.log("[CopilotRoute] Last message role:", lastMsg.role, "content:", lastMsg.content ? (lastMsg.content.slice(0, 150) + "...") : "empty", "tool_calls:", lastMsg.tool_calls ? JSON.stringify(lastMsg.tool_calls) : "none");
  //   }
  // } catch (e) {
  //   console.log("[CopilotRoute] REFERER:", referer, "USE_QWEN:", useQwen, "MODEL:", model, "Error reading request body");
  // }

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
