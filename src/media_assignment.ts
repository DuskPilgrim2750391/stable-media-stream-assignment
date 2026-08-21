import { createHash } from "node:crypto";

export type Variant = "control" | "low-latency";

export interface Assignment {
  experiment: string;
  variant: Variant;
  bucket: number;
  manifestUrl: string;
  assetId: string;
  deliveryId: string;
}

export interface ReadyMedia {
  userId: string;
  experiment: string;
  treatmentPercent: number;
  enabled: boolean;
  asset: { id: string; ingestionStatus: "ready" };
  processingJob: {
    id: string;
    status: "completed";
    manifests: { control: string; lowLatency: string };
  };
  creatorDelivery: { id: string; status: "published" };
}

export function stableBucket(experiment: string, userId: string): number {
  const digest = createHash("sha256")
    .update(`${experiment}\u0000${userId}`)
    .digest();
  return digest.readUInt32BE(0) % 10_000;
}

export function assignStream(input: ReadyMedia): Assignment {
  const bucket = stableBucket(input.experiment, input.userId);
  const inTreatment = input.enabled && bucket < input.treatmentPercent * 100;
  const variant: Variant = inTreatment ? "low-latency" : "control";

  return {
    experiment: input.experiment,
    variant,
    bucket,
    manifestUrl: inTreatment
      ? input.processingJob.manifests.lowLatency
      : input.processingJob.manifests.control,
    assetId: input.asset.id,
    deliveryId: input.creatorDelivery.id
  };
}
