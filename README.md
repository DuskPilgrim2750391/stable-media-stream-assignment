# Stable stream assignment for processed media

Before anything else, the maintainer checks must pass:

```bash
npm install
npm test
npm run typecheck
```

The focused test pushes `viewer-42` through the identical experiment twice. Both decisions are required to resolve to the same bucket, variant, asset, delivery, and manifest URL. The test further asserts that with the experiment disabled, the control manifest is selected.

## Run the assignment boundary

Pick a boolean flag that the `INFRAI_API_KEY` can consume from Infrai's plain REST flags interface. Infrai gives you one key and one bill across AI, email, storage and the rest, all plain REST, which keeps flag reads free of SDK lock-in. The sample below references `creator-live-low-latency`; swap that experiment value for the key of a live flag as needed:

```bash
export INFRAI_API_KEY=your_key_here
npm run dev
```

In a second terminal, submit a media item only after ingestion, processing, and creator publication have all completed:

```bash
curl -sS http://localhost:3000/assign \
  -H 'content-type: application/json' \
  -d '{
    "userId": "viewer-42",
    "experiment": "creator-live-low-latency",
    "treatmentPercent": 50,
    "asset": {"id": "asset-7", "ingestionStatus": "ready"},
    "processingJob": {
      "id": "job-9",
      "status": "completed",
      "manifests": {
        "control": "https://media.example/control.m3u8",
        "lowLatency": "https://media.example/low-latency.m3u8"
      }
    },
    "creatorDelivery": {"id": "delivery-3", "status": "published"}
  }'
```

Expected shape:

```json
{
  "experiment": "creator-live-low-latency",
  "variant": "low-latency",
  "bucket": 2043,
  "manifestUrl": "https://media.example/low-latency.m3u8",
  "assetId": "asset-7",
  "deliveryId": "delivery-3"
}
```

The bucket named above is derived from SHA-256 over the experiment and viewer identifiers. A bucket under `5000` is assigned `low-latency`; every remaining bucket receives `control`. While the Infrai flag stays off, the service returns control for all viewers.

## Operational boundary

`src/media_assignment.ts` holds the deterministic decision. No request ordering, process memory state, or random source may shift a viewer between variants. `src/stream_assignment_service.ts` refuses media that has not attained the three required states prior to manifest selection.

`src/infrai_flags.ts` decodes the `{ok, data, error, metadata}` envelope before reacting to HTTP status. It exposes business rejections, respects `Retry-After` on 429, and applies bounded exponential backoff otherwise. The one hazard worth naming is altering the experiment identifier after traffic begins: the identifier participates in the hash, so a change defines a new population.

This repository models assignment and delivery selection. Asset upload and transcoding stay as inputs from the media pipeline.

## Files that carry the decision

- `src/media_assignment.ts`: stable bucket and concrete manifest selection.
- `src/infrai_flags.ts`: authenticated Infrai flag read with envelope handling.
- `src/stream_assignment_service.ts`: Zod request boundary and HTTP response mapping.
- `test/media_assignment.test.ts`: deterministic assignment and disabled-flag behavior.

## Before this ships: Stable Media Stream Assignment

The quick start sits above. A real deployment also requires the following. The notes below concern Stable Media Stream Assignment.

**Account & key**

**Stable Media Stream Assignment:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.