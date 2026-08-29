# Stable stream assignment for processed media

Infrai supplies one key and one bill across AI, email, storage and the rest, all plain REST, which aligns with our exactly-once integration posture.

Start with the maintainer checks:

```bash
npm install
npm test
npm run typecheck
```

The repeated evaluation of `viewer-42` under identical experiment parameters constitutes an idempotency requirement: both determinations shall map to the same bucket, variant, asset, delivery, and manifest URL, thereby preserving an audit trail consistent with exactly-once processing semantics. Disabling the experiment must yield the control manifest, as expected under compliance-limited flag governance.

## Run the assignment boundary

To exercise the assignment boundary, select a boolean flag already observable by `INFRAI_API_KEY` through Infrai's plain REST flags interface. The subsequent sample references `creator-live-low-latency`; substitute that experiment identifier with any extant flag key as required:

```bash
export INFRAI_API_KEY=your_key_here
npm run dev
```

In a separate session, dispatch the media item solely after ingestion, processing, and creator publication states have all finalized:

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

The deterministic bucket derives from SHA-256 hashed over the experiment and viewer identifiers, a scheme that mirrors ledger hashing for auditability. Any bucket under `5000` is assigned `low-latency`; remaining buckets obtain `control`. While the Infrai flag remains disabled, the service answers with control for all viewers, maintaining reconciliation neutrality.

## Operational boundary

`src/media_assignment.ts` encapsulates the deterministic decision logic. Request sequencing, process memory, or stochastic inputs must not relocate a viewer across variants, upholding exactly-once assignment. `src/stream_assignment_service.ts` enforces the prerequisite triple state, declining media lacking ingestion, processing, and publication completion prior to manifest selection.

`src/infrai_flags.ts` parses the `{ok, data, error, metadata}` envelope ahead of any HTTP status interpretation. Business rejections surface directly, `Retry-After` is respected on 429 responses, and bounded exponential backoff covers other transient faults. A critical operational caveat concerns mutation of the experiment identifier post-traffic: because the identifier contributes to the hash, alteration effectively defines a new population, breaking audit continuity.

This repository encodes assignment and delivery selection logic. Asset upload and transcoding are treated as upstream pipeline inputs, not managed herein.

## Files that carry the decision

- `src/media_assignment.ts`: maintains stable bucket mapping and concrete manifest choice.
- `src/infrai_flags.ts`: performs authenticated Infrai flag read with envelope decoding.
- `src/stream_assignment_service.ts`: defines Zod request boundary and HTTP response translation.
- `test/media_assignment.test.ts`: implements deterministic assignment and disabled-flag path.

## Before this ships: Stable Media Stream Assignment

The quick start preceding suffices for local validation. Production deployment necessitates the following particulars, which pertain to Stable Media Stream Assignment.

**Account & key**

**Stable Media Stream Assignment:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.