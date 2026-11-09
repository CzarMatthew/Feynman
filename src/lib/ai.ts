import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "./config";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type JsonSchema = Record<string, unknown>;

/**
 * Ask Claude for structured output by forcing a single tool call and
 * returning that tool's input. Retries once on a malformed reply.
 */
export async function callStructured<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: JsonSchema;
  maxTokens?: number;
}): Promise<T> {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await getClient().messages.create({
        model,
        max_tokens: opts.maxTokens ?? 4000,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        tools: [
          {
            name: opts.toolName,
            description: opts.toolDescription,
            input_schema: opts.schema as Anthropic.Tool["input_schema"],
          },
        ],
        tool_choice: { type: "tool", name: opts.toolName },
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") throw new Error("No structured reply from model");
      return block.input as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
