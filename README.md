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
- **Import** reloads a previous session from those two files. The import performs a shallow shape check on `track.json`; malformed or semantically wrong data may not be caught until a later step fails.
- Scale calibration stores a single pixels-per-meter value applied uniformly to both axes. This assumes the rectified image has isotropic scaling.
- There is **no cloud storage or sync**. Sessions only persist via the exported files on your local machine.

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

### 4) Centerline Editing + Demo
- Draw and adjust a racing centerline over the top-down map
- Save centerline points in `track.json`
- Run a simple centerline follower demo with steering and speed controls
  *(The demo is embedded in the editor flow, not a separate page)*

### 5) Portable Import / Export Format
- Import an existing session from `topdown.png` + `track.json` (shallow validation)
- Export:
  - `topdown.png` (rectified image, downloaded locally)
  - `track.json` (scale + annotation + centerline metadata, downloaded locally)

---

## Output files

### `topdown.png`
Rectified, top-down version of the imported screenshot.

### `track.json`
Contains:
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
- **Cloudflare-ready** deployment (Pages + optional Worker integrations)

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

## Roadmap (future work)

These are not yet implemented:

- Centerline smoothing and editing tools beyond point add/drag/undo/clear
- Bezier zone tools, snapping, and richer zone parameters
- Cloudflare Worker endpoints to persist tracks to **R2** (images) + **D1** (index/metadata)
- Dedicated standalone viewer/replay page separate from the editor flow
- Simulation/optimization layer (setup sweep coach) using this track twin as input
