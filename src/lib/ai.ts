import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL } from "./config";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export type JsonSchema = Record<string, unknown>;

const MIN_TOKENS = 16000;
const RETRY_TOKENS = 20000;

// Structured outputs accept a subset of JSON Schema: every object needs
// additionalProperties: false, and length/number limits aren't allowed.
const DROP_KEYS = new Set([
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "maxItems",
  "pattern",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "patternProperties",
]);
const FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

export function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (DROP_KEYS.has(k)) continue;
    if (k === "format" && (typeof v !== "string" || !FORMATS.has(v))) continue;
    if (k === "minItems") {
      if (typeof v === "number") out.minItems = v > 0 ? 1 : 0;
      continue;
    }
    if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
      // Property names are kept as-is; only their schemas are cleaned.
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([name, s]) => [name, toStrictSchema(s)])
      );
      continue;
    }
    out[k] = toStrictSchema(v);
  }
  const t = out.type;
  if (t === "object" || (Array.isArray(t) && t.includes("object")) || "properties" in out) {
    out.additionalProperties = false;
  }
  return out;
}

/**
 * Ask Claude for a JSON reply that matches `schema` (structured outputs).
 * toolName/toolDescription are kept so existing callers don't change; the
 * description is passed along as a note on what the JSON is for.
 * Retries once on a malformed reply.
 */
export async function callStructured<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: JsonSchema;
  maxTokens?: number;
  temperature?: number; // ignored; not supported by current models
}): Promise<T> {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  // Generous budgets: you only pay for tokens actually used, and current
  // models may think before answering, which counts against max_tokens.
  // Stay under ~21k, the SDK's limit for non-streaming requests.
  const budgets = [Math.max(opts.maxTokens ?? 0, MIN_TOKENS), RETRY_TOKENS];

  let lastErr: unknown;
  for (let attempt = 0; attempt < budgets.length; attempt++) {
    const params = {
      model,
      max_tokens: budgets[attempt],
      system: `${opts.system}\n\nYour reply is JSON for "${opts.toolName}": ${opts.toolDescription}`,
      messages: [{ role: "user", content: opts.user }],
      output_config: {
        format: { type: "json_schema", schema: toStrictSchema(opts.schema) },
      },
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    try {
      const res = await getClient().messages.create(params);
      if (res.stop_reason === "max_tokens") {
        throw new Error(`Reply was cut off at ${budgets[attempt]} tokens.`);
      }
      if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (!text.trim()) throw new Error("No structured reply from model");
      return JSON.parse(text) as T;
    } catch (e) {
      lastErr = e;
      // A 400 means the request itself is wrong; retrying won't help.
      if (e instanceof Anthropic.APIError && e.status === 400) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}