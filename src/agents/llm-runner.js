const LLM_PROVIDER = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || (LLM_PROVIDER === "openai-compatible" ? "gpt-4o-mini" : "claude-sonnet-4-20250514");
const LLM_BASE_URL = process.env.LLM_BASE_URL || (LLM_PROVIDER === "openai-compatible" ? "https://api.openai.com/v1" : "https://api.anthropic.com");
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT || "15000", 10);

const DIRECTIONS = ["up", "down", "left", "right"];

function parseMove(text) {
  if (!text) return null;
  const cleaned = text.toLowerCase().replace(/[^a-z]/g, "").trim();
  if (DIRECTIONS.includes(cleaned)) return cleaned;
  return null;
}

async function callProvider(prompt) {
  if (!LLM_API_KEY || LLM_API_KEY === "sk-ant-..." || LLM_API_KEY === "sk-...") {
    throw new Error("LLM_API_KEY not set");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const start = Date.now();
    if (LLM_PROVIDER === "openai-compatible") {
      const result = await callOpenAICompatible(prompt, controller.signal);
      return { ...result, latency: Date.now() - start };
    }
    const result = await callAnthropic(prompt, controller.signal);
    return { ...result, latency: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(prompt, signal) {
  const base = LLM_BASE_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": LLM_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: 16,
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }

  const json = await res.json();
  const text = json.content?.[0]?.text || "";
  return { text };
}

async function callOpenAICompatible(prompt, signal) {
  const base = LLM_BASE_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${LLM_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: 16,
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API ${res.status}: ${body}`);
  }

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  return { text };
}

async function getLLMMove(prompt) {
  const result = await callProvider(prompt);
  const direction = parseMove(result.text);
  return { direction, latency: result.latency, raw: result.text, parsed: direction !== null };
}

module.exports = { getLLMMove, parseMove, DIRECTIONS };
