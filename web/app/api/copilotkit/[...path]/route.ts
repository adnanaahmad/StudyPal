import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
const COPILOT_MODEL = process.env.COPILOT_MODEL ?? "qwen2.5:7b";

const openai = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: "ollama",
});

const serviceAdapter = new OpenAIAdapter({
  openai,
  model: COPILOT_MODEL,
  disableParallelToolCalls: true,
  keepSystemRole: true,
});

const runtime = new CopilotRuntime();

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};

export const GET = async (req: NextRequest) => {
  // CopilotSidebar may request thread history from /api/copilotkit/threads.
  // In this local runtime setup we don't persist threads yet, so return an
  // empty list instead of surfacing a 405.
  if (req.nextUrl.pathname.endsWith("/threads")) {
    return NextResponse.json({ threads: [] });
  }
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
