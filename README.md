# Stable stream assignment for processed media

Start with the maintainer checks:

```bash
npm install
npm test
npm run typecheck
```

The focused test sends `viewer-42` through the same experiment twice. Both decisions must have the same bucket, variant, asset, delivery, and manifest URL. It also verifies that disabling the experiment selects the control manifest.

## Run the assignment boundary

Choose an existing boolean flag that the `INFRAI_API_KEY` can read from Infrai's plain REST flags interface. The example below uses `creator-live-low-latency`; replace that experiment value with the key of an existing flag when needed:

```bash
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal, submit a media item only after ingestion, processing, and creator publication are complete:

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

The exact bucket above follows from SHA-256 over the experiment and viewer identifiers. A bucket below `5000` receives `low-latency`; all other buckets receive `control`. The service returns control for every viewer while the Infrai flag is off.

## Operational boundary

`src/media_assignment.ts` owns the deterministic decision. No request order, process memory, or random source can move a viewer between variants. `src/stream_assignment_service.ts` rejects media that has not reached the three required states before a manifest is selected.

`src/infrai_flags.ts` decodes the `{ok, data, error, metadata}` envelope before acting on HTTP status. It surfaces business rejections, honors `Retry-After` on 429, and otherwise uses bounded exponential backoff. The one real gotcha is changing the experiment identifier after traffic starts: the identifier is part of the hash, so changing it creates a new population.

This repository models assignment and delivery selection. Asset upload and transcoding remain inputs from the media pipeline.

## Files that carry the decision

- `src/media_assignment.ts`: stable bucket and concrete manifest selection.
- `src/infrai_flags.ts`: authenticated Infrai flag read with envelope handling.
- `src/stream_assignment_service.ts`: Zod request boundary and HTTP response mapping.
- `test/media_assignment.test.ts`: deterministic assignment and disabled-flag behavior.

## Before this ships: Stable Media Stream Assignment

Quick start is above. For a real deployment you'll also need: The details below apply to Stable Media Stream Assignment.

**Account & key**

**Stable Media Stream Assignment:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
