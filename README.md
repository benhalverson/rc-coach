# RC Racing Digital Twin — Track Editor

A lightweight, **browser-first track editor** for building a 2D “digital twin” of competitive RC racing tracks.

This project turns a track screenshot (photo/screenshot of the layout) into a **rectified top-down map** you can **scale to real-world dimensions** and **annotate with track features** like jumps and wall rides. The output is a portable `track.json` + `topdown.png` that can later plug into simulation, setup optimization, analytics, or ghost/replay tooling.

Built with **Angular 21 + Signals** and designed to run well on **Cloudflare** (static app + optional Worker/R2/D1 storage).

---

## Why this exists

Competitive RC setup tuning is hard because feedback is subjective (“it feels pushy”). A digital twin starts with a trustworthy track model. This editor is the first milestone: **get the track into a clean, scaled coordinate system** and capture key features that matter for driving and setup (jumps, wall rides, etc.).

---

## Core features

### 1) Screenshot → True Top-Down Rectification
- Upload a track screenshot
- Select a 4-point quad (TL/TR/BR/BL) that represents the floor plane
- Warp the image into a **top-down orthographic map** using perspective transform

### 2) Real-World Scaling
- Define the physical size of the rectified plane (meters / feet)
- Track coordinates are stored normalized (0..1) so scaling is consistent and future-proof

### 3) Feature Annotation (Zones)
- Draw zones directly on the top-down map:
  - **Jump** zones
  - **Wall ride** zones
- Zones are saved as polygons (rectangles for v1, extensible to arbitrary polygons later)

### 4) Portable Export Format
- Export:
  - `topdown.png` (rectified image)
  - `track.json` (scale + annotation metadata)
- Output is designed to be consumed by later tools:
  - physics sim / setup sweeps
  - racing line analysis
  - ghost laps / replays

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
- import metadata (source image name + quad points for reproducibility)

---

## Tech stack

- **Angular 21** (standalone components + Signals)
- **OpenCV.js** (warpPerspective / perspective transform)
- **Cloudflare-ready** deployment (Pages + optional Worker integrations)

---

## Roadmap

- Track centerline editor (polyline + smoothing)
- Polygon / bezier zone tools + snapping
- Measure tool (click two points → known distance calibration)
- Cloudflare Worker endpoints to persist tracks to **R2** (images) + **D1** (index/metadata)
- Simulation/optimization layer (setup sweep coach) using this track twin as input
