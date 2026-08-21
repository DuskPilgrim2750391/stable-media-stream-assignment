import { createServer } from "node:http";
import { z } from "zod";
import { experimentIsEnabled, InfraiError } from "./infrai_flags.js";
import { assignStream } from "./media_assignment.js";

const assignmentRequest = z.object({
  userId: z.string().min(1),
  experiment: z.string().min(1),
  treatmentPercent: z.number().int().min(0).max(100),
  asset: z.object({
    id: z.string().min(1),
    ingestionStatus: z.literal("ready")
  }),
  processingJob: z.object({
    id: z.string().min(1),
    status: z.literal("completed"),
    manifests: z.object({
      control: z.string().url(),
      lowLatency: z.string().url()
    })
  }),
  creatorDelivery: z.object({
    id: z.string().min(1),
    status: z.literal("published")
  })
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function reply(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/assign") {
    reply(response, 404, { error: "route not found" });
    return;
  }

  try {
    const input = assignmentRequest.parse(await readJson(request));
    const enabled = await experimentIsEnabled(input.experiment);
    reply(response, 200, assignStream({
      userId: input.userId,
      experiment: input.experiment,
      treatmentPercent: input.treatmentPercent,
      enabled,
      asset: {
        id: input.asset.id,
        ingestionStatus: input.asset.ingestionStatus
      },
      processingJob: {
        id: input.processingJob.id,
        status: input.processingJob.status,
        manifests: {
          control: input.processingJob.manifests.control,
          lowLatency: input.processingJob.manifests.lowLatency
        }
      },
      creatorDelivery: {
        id: input.creatorDelivery.id,
        status: input.creatorDelivery.status
      }
    }));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      reply(response, 400, { error: "invalid assignment request" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      reply(response, status, { error: error.code });
      return;
    }
    reply(response, 502, { error: "assignment dependency rejected the request" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`stream assignment service listening on http://localhost:${port}`);
});
