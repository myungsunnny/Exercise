import "server-only";

// Gemini generateContent REST 클라이언트. API 키는 서버 환경변수로만 읽는다(NEXT_PUBLIC 금지).
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// 기본 모델이 과부하(503 등)일 때 전환할 모델
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";
export const aiConfigured = () => !!process.env.GEMINI_API_KEY;

export class AIError extends Error {
  constructor(message: string, public code: "no_key" | "limit" | "upstream" | "timeout" | "blocked" | "invalid") {
    super(message);
  }
}

export type Part = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
};
export type Content = { role: "user" | "model"; parts: Part[] };

// Gemini Schema(OpenAPI 부분집합). 타입은 대문자 enum을 쓴다.
export type Schema = {
  type: "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN" | "ARRAY" | "OBJECT";
  description?: string;
  enum?: string[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
};
export type FunctionDecl = { name: string; description: string; parameters?: Schema };

type Options = {
  system: string;
  contents: Content[];
  tools?: FunctionDecl[];
  schema?: Schema;
  maxOutputTokens?: number;
  temperature?: number;
  model?: string; // 지정하면 그 모델만 사용(도구 호출 대화 중 모델 고정용)
};

export type GenerateResult = { content: Content; text: string; calls: { name: string; args: Record<string, unknown>; id?: string }[]; tokens: number; model: string };

const RETRYABLE = new Set([500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 일시 오류는 같은 모델로 한 번 재시도하고, 그래도 실패하면 대체 모델로 전환한다.
export async function generate(opts: Options): Promise<GenerateResult> {
  const models = opts.model ? [opts.model] : [...new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL])];
  let last: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await generateOnce(opts, model);
      } catch (e) {
        last = e;
        if (!(e instanceof RetryableError)) throw e;
        if (attempt === 0) await sleep(1000);
      }
    }
  }
  throw last instanceof RetryableError ? new AIError("AI 모델 사용량이 많아 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.", "upstream") : last;
}

class RetryableError extends Error {}

async function generateOnce(opts: Options, model: string): Promise<GenerateResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError("Gemini API 키가 설정되지 않았습니다.", "no_key");

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    ...(opts.tools?.length ? { tools: [{ functionDeclarations: opts.tools }] } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
    },
  };

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AIError("AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", "timeout");
    throw new AIError("AI 서버에 연결하지 못했습니다.", "upstream");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[gemini]", model, res.status, detail.slice(0, 500));
    if (RETRYABLE.has(res.status)) throw new RetryableError(String(res.status));
    if (res.status === 429) throw new AIError("Gemini API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.", "limit");
    if (res.status === 400 || res.status === 404) throw new AIError("AI 요청 형식 또는 모델 설정(GEMINI_MODEL)을 확인해 주세요.", "invalid");
    if (res.status === 401 || res.status === 403) throw new AIError("Gemini API 키가 올바르지 않거나 권한이 없습니다.", "no_key");
    throw new AIError("AI 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "upstream");
  }

  const data = (await res.json()) as {
    candidates?: { content?: Content; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { totalTokenCount?: number };
  };
  const cand = data.candidates?.[0];
  if (data.promptFeedback?.blockReason || !cand?.content) {
    throw new AIError("AI가 이 요청에 응답하지 않았습니다. 질문을 바꿔 다시 시도해 주세요.", "blocked");
  }
  const content: Content = { role: "model", parts: cand.content.parts ?? [] };
  return {
    content,
    text: content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim(),
    calls: content.parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {}, id: p.functionCall!.id })),
    tokens: data.usageMetadata?.totalTokenCount ?? 0,
    model,
  };
}

// 구조화 JSON 응답 생성 + 파싱
export async function generateJson(opts: Omit<Options, "tools"> & { schema: Schema }): Promise<{ json: unknown; tokens: number }> {
  const r = await generate({ ...opts, temperature: opts.temperature ?? 0.3 });
  try {
    return { json: JSON.parse(r.text), tokens: r.tokens };
  } catch {
    throw new AIError("AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.", "invalid");
  }
}
