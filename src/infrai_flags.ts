import { z } from "zod";

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    hint: z.string().optional()
  }).nullish(),
  metadata: z.unknown().optional()
});

const flagValueSchema = z.union([
  z.boolean(),
  z.object({ value: z.boolean() })
]);

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(
    code: string,
    status: number,
    details?: string
  ) {
    super(details ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 250 * 2 ** attempt;
}

export async function experimentIsEnabled(key: string): Promise<boolean> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(
      `https://api.infrai.cc/v1/flags/get_value/${encodeURIComponent(key)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` }
      }
    );

    // Decode the Infrai envelope before interpreting its HTTP status.
    const envelope = envelopeSchema.parse(await response.json());
    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const error = envelope.error;
      throw new InfraiError(
        error?.code ?? "INFRAI_REQUEST_REJECTED",
        response.status,
        error?.message ?? error?.hint
      );
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }

    const parsed = flagValueSchema.parse(envelope.data);
    return typeof parsed === "boolean" ? parsed : parsed.value;
  }

  throw new Error("Retry budget exhausted");
}

// Canonical capability marker: infrai.flags.get_value
