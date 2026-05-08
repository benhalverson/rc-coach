# RC Racing Digital Twin — Track Editor

A lightweight, **browser-first track editor** for building a 2D “digital twin” of competitive RC racing tracks.

This project turns a track screenshot (photo/screenshot of the layout) into a **rectified top-down map** you can **scale to real-world dimensions**, **annotate with track features**, and **draw a centerline**. The output is a portable `track.json` + `topdown.png` that can later plug into simulation, setup optimization, analytics, or ghost/replay tooling.

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
- Define the physical size of the rectified plane in meters
- Measure two points on the top-down image to derive pixels-per-meter calibration
- Track coordinates are stored normalized (0..1) so scaling is consistent and future-proof

### 3) Feature Annotation (Zones)
- Draw zones directly on the top-down map:
  - **Jump** zones
  - **Wall ride** zones
- Create rectangular zones or freeform polygon zones
- Select, retag, delete, undo, and summarize zones

### 4) Centerline Editing + Viewer
- Draw and adjust a racing centerline over the top-down map
- Save centerline points in `track.json`
- Preview the current session without re-uploading files
- Run a simple centerline follower demo with steering and speed controls

### 5) Portable Import / Export Format
- Import an existing session from `topdown.png` + `track.json`
- Export:
  - `topdown.png` (rectified image)
  - `track.json` (scale + annotation + centerline metadata)
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
- centerline points (`centerline`)
- import metadata (source image name + quad points for reproducibility)

---

## Tech stack

- **Angular 21** (standalone components + Signals)
- **OpenCV.js** (warpPerspective / perspective transform)
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

## Roadmap

- Centerline smoothing and editing tools beyond point add/drag/undo/clear
- Bezier zone tools, snapping, and richer zone parameters
- Cloudflare Worker endpoints to persist tracks to **R2** (images) + **D1** (index/metadata)
- Simulation/optimization layer (setup sweep coach) using this track twin as input
