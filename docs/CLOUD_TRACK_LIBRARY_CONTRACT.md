# Cloud Track Library Contract (R2 + D1)

This document defines the storage and API contract for saved track persistence on Cloudflare.
It is intentionally narrow so local `topdown.png` + `track.json` import/export remains the reliable fallback path.

## Goals

- Store top-down images in **R2**.
- Store/query track metadata in **D1**.
- Preserve current single-route editor workflow.
- Keep local export/import fully supported.

## Storage Contract

### D1 (`TRACKS_DB`)

Table: `tracks`

- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `width_meters REAL NOT NULL`
- `height_meters REAL NOT NULL`
- `topdown_w_px INTEGER NOT NULL`
- `topdown_h_px INTEGER NOT NULL`
- `image_key TEXT NOT NULL`
- `track_json TEXT NOT NULL` (full validated `TrackDef` payload)
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

Index:

- `idx_tracks_updated_at` on `updated_at DESC`

### R2 (`TRACK_IMAGES`)

Object key format:

- `tracks/{trackId}/topdown.png`

Object metadata:

- `Content-Type: image/png`

## HTTP API Contract

All endpoints are under `/api/tracks`.

### `POST /api/tracks`

Saves/updates a track record and its top-down PNG.

Request body:

```json
{
  "track": { "...TrackDef..." },
  "topdownPngBase64": "iVBORw0KGgoAAAANSUhEUg..."
}
```

Behavior:

- `track` is validated against existing `TrackDef` export validation rules (non-draft).
- PNG bytes are decoded from `topdownPngBase64`.
- Image is written to R2.
- Metadata and serialized `track_json` are upserted in D1.

Success response:

- `201 Created`
- `{ "id": "...", "imageKey": "...", "savedAt": "..." }`

### `GET /api/tracks`

Lists saved tracks from D1 (metadata/index only).

Query params:

- `page` (default `1`)
- `pageSize` (default `25`, max `100`)

Success response:

```json
{
  "items": [
    {
      "id": "...",
      "name": "...",
      "widthMeters": 20,
      "heightMeters": 12,
      "topdownPx": { "w": 1600, "h": 900 },
      "createdAt": "...",
      "updatedAt": "...",
      "imageUrl": "/api/tracks/{id}/topdown.png"
    }
  ],
  "page": 1,
  "pageSize": 25
}
```

### `GET /api/tracks/:id`

Fetches a saved track payload from D1.

Success response:

```json
{
  "track": { "...TrackDef..." },
  "createdAt": "...",
  "updatedAt": "...",
  "imageUrl": "/api/tracks/{id}/topdown.png"
}
```

### `GET /api/tracks/:id/topdown.png`

Streams PNG bytes from R2 using the key stored in D1.

## Error Contract

- `400`: invalid request body or invalid track payload
- `404`: track/image not found
- `413`: PNG payload too large
- `503`: Cloudflare bindings are not configured (`TRACKS_DB` / `TRACK_IMAGES`)
- `500`: unexpected server/storage error

Error response shape:

```json
{ "error": "human-readable message" }
```

## Required Wrangler bindings

```jsonc
"d1_databases": [
  { "binding": "TRACKS_DB", "database_name": "rc_coach_tracks", "database_id": "<id>" }
],
"r2_buckets": [
  { "binding": "TRACK_IMAGES", "bucket_name": "rc-coach-track-images" }
]
```
