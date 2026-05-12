# RC Racing Digital Twin — Track Editor

A lightweight, **browser-first track editor** for building a 2D "digital twin" of competitive RC racing tracks.

This project turns a track screenshot (photo/screenshot of the layout) into a **rectified top-down map** you can **scale to real-world dimensions**, **annotate with track features**, and **draw a centerline**. The output is a portable `track.json` + `topdown.png` that can later plug into simulation, setup optimization, analytics, or ghost/replay tooling.

Built with **Angular 21 + Signals** and designed to run well on **Cloudflare** (static app + optional Worker/R2/D1 storage).

---

## Why this exists

Competitive RC setup tuning is hard because feedback is subjective ("it feels pushy"). A digital twin starts with a trustworthy track model. This editor is the first milestone: **get the track into a clean, scaled coordinate system** and capture key features that matter for driving and setup (jumps, wall rides, etc.).

For the current implementation inventory and known gaps, see [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).

---

## Getting started

**Requirements:** Node.js >= 20, [pnpm](https://pnpm.io/) 10.23.0 (pinned via `packageManager` in `package.json`).

```sh
# Install dependencies
pnpm install --frozen-lockfile

# Start local dev server (http://localhost:4200)
pnpm start

# Build for production
pnpm build

# Run tests
pnpm test

# Build then preview via Wrangler (Cloudflare Workers runtime)
pnpm preview
```

> **OpenCV assets:** `opencv.js` and `opencv_js.wasm` are already bundled under `public/assets/opencv/`.
> No manual download is required. The app loads them at runtime when performing the perspective warp step.

---

## MVP workflow

The app is a single-page editor. The typical session looks like this:

1. **Upload** a track photo or screenshot — or **import** an existing `topdown.png` + `track.json` pair.
2. **Pick a 4-point quad** (TL → TR → BR → BL) that outlines the floor plane of the track.
3. **Warp** the image into a top-down view using OpenCV.js perspective transform.
4. **Calibrate scale** by measuring two known points on the top-down image and entering the real-world distance, yielding a pixels-per-meter value.
5. **Annotate zones** (jumps, wall rides) as rectangles or polygons on the top-down map.
6. **Edit the centerline** by adding, dragging, undoing, and clearing points.
7. **Export** `topdown.png` + `track.json`, or run the built-in centerline follower demo.

### Import / Export notes

- **Export** writes `topdown.png` (the rectified canvas) and `track.json` (scale, zones, centerline, and source quad metadata) as local file downloads.
- **Import** reloads a previous session from those two files. The import performs **strict schema validation** on `track.json`: all required fields are checked, the `schemaVersion` must match `v1` (or a legacy unversioned file is accepted with a warning), and errors are surfaced immediately in the UI.
- Scale calibration stores a single pixels-per-meter value applied uniformly to both axes. This assumes the rectified image has isotropic scaling.
- Cloud persistence is available through Worker API endpoints backed by **D1 + R2** (see [`docs/CLOUD_TRACK_LIBRARY_CONTRACT.md`](docs/CLOUD_TRACK_LIBRARY_CONTRACT.md)).
- Local export/import remains fully supported as a reliable fallback.

---

## Core features

### 1) Screenshot → True Top-Down Rectification
- Upload a track screenshot
- Select a 4-point quad (TL/TR/BR/BL) that represents the floor plane
- Warp the image into a **top-down orthographic map** using perspective transform

### 2) Real-World Scaling
- Define the physical size of the rectified plane in meters
- Measure two points on the top-down image to derive pixels-per-meter calibration
- Track coordinates are stored normalized (0..1) so scaling is consistent and future-proof

### 3) Feature Annotation (Zones)
- Draw zones directly on the top-down map:
  - **Jump** zones
  - **Wall ride** zones
- Create rectangular zones or freeform polygon zones
- Select, retag, delete, undo, and summarize zones
- **Vertex editing** on selected zones: drag individual vertices, insert new vertices on edges, and delete vertices (minimum 3-point triangles preserved)

### 4) Centerline Editing + Demo
- Draw and adjust a racing centerline over the top-down map
- Save centerline points in `track.json`
- **Derived centerline geometry** (arc lengths, tangents, normals) is computed from the stored points for the follower demo
- Run a simple centerline follower demo with steering and speed controls
  *(The demo is embedded in the editor flow, not a separate page)*

### 5) Portable Import / Export Format
- Import an existing session from `topdown.png` + `track.json` (strict `schemaVersion v1` validation)
- Export:
  - `topdown.png` (rectified image, downloaded locally)
  - `track.json` (scale + annotation + centerline metadata, downloaded locally)

---

## Output files

### `topdown.png`
Rectified, top-down version of the imported screenshot.

### `track.json`
Contains:
- `schemaVersion` (currently `1`)
- track name + id
- real-world dimensions (`widthMeters`, `heightMeters`)
- top-down image pixel size
- annotations (`zones`)
- centerline points (`centerline`)
- import metadata (source image name + quad points for reproducibility)

---

## Tech stack

- **Angular 21** (standalone components + Signals)
- **OpenCV.js** (warpPerspective / perspective transform) — bundled in `public/assets/opencv/`
- **Tailwind CSS v4**
- **Biome** (formatting + linting for TypeScript/CSS/HTML)
- **Cloudflare-ready** deployment (Pages + optional Worker integrations)

---

## Local development commands

Verified from the repo root with `pnpm 10.23.0`:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm start
```

- `pnpm install --frozen-lockfile` succeeds.
- `pnpm test` succeeds with the current Angular/Vitest setup.
- `pnpm build` succeeds and writes the SSR bundle to `dist/`.
- `pnpm start` runs `ng serve` and starts the local dev server on port `4200`.

### Code formatting and linting

This project uses [Biome](https://biomejs.dev/) for formatting and linting TypeScript, CSS, and HTML files. There is no `pnpm lint` script wired up yet; run Biome directly:

```sh
# Format all files
pnpm exec biome format --write .

# Lint and apply safe fixes
pnpm exec biome lint --write .

# Check everything (format + lint) without writing
pnpm exec biome check .
```

The Biome configuration lives in `biome.json` at the repo root.

### Cloudflare type generation

```sh
pnpm cf-typegen
```

`pnpm cf-typegen` runs `wrangler types`, but the current Wrangler version requires Node.js `>=22`.
It failed in verification on Node.js `20.20.2` with:

```text
Wrangler requires at least Node.js v22.0.0. You are using v20.20.2.
```

Use Node.js 22 or newer when regenerating Cloudflare types locally.

---

## Maintainer setup

This repo uses the GitHub CLI for issue and PR maintenance. Check local auth before triage or release work:

```sh
gh auth status
gh auth login -h github.com
gh repo view
gh issue list --state open
gh pr list --state open
```

---

## Roadmap (open issues)

The following are tracked as open GitHub issues:

- [#56 — Editor polish: snapping and centerline tools](https://github.com/benhalverson/rc-coach/issues/56) — toggleable snapping, centerline simplify/smooth controls, deeper undo
- [#55 — Standalone viewer/replay foundation](https://github.com/benhalverson/rc-coach/issues/55) — separate viewer route for inspecting exported `v1` track files
- [#57 — Cloud persistence: saved track library](https://github.com/benhalverson/rc-coach/issues/57) — Cloudflare R2 (images) + D1 (metadata) backend
- [#53 — Coach prototype: symptom survey recommendations](https://github.com/benhalverson/rc-coach/issues/53) — local symptom-survey UI with explainable setup suggestions
- [#54 — Coach rules engine v1](https://github.com/benhalverson/rc-coach/issues/54) — pure TypeScript rules layer for setup recommendations
