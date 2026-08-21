import assert from "node:assert/strict";
import test from "node:test";
import { assignStream, stableBucket } from "../src/media_assignment.js";

const readyMedia = {
  userId: "viewer-42",
  experiment: "creator-live-low-latency",
  treatmentPercent: 50,
  enabled: true,
  asset: { id: "asset-7", ingestionStatus: "ready" as const },
  processingJob: {
    id: "job-9",
    status: "completed" as const,
    manifests: {
      control: "https://media.example/control.m3u8",
      lowLatency: "https://media.example/low-latency.m3u8"
    }
  },
  creatorDelivery: { id: "delivery-3", status: "published" as const }
};

test("the same viewer stays in one stream variant", () => {
  const first = assignStream(readyMedia);
  const repeated = assignStream(readyMedia);

  assert.deepEqual(repeated, first);
  assert.equal(first.bucket, stableBucket(readyMedia.experiment, readyMedia.userId));
  assert.equal(
    first.manifestUrl,
    first.variant === "low-latency"
      ? readyMedia.processingJob.manifests.lowLatency
      : readyMedia.processingJob.manifests.control
  );
});

test("a disabled experiment always serves control", () => {
  const assignment = assignStream({ ...readyMedia, enabled: false });
  assert.equal(assignment.variant, "control");
  assert.equal(assignment.manifestUrl, readyMedia.processingJob.manifests.control);
});
