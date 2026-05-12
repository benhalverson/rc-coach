# Implementation Status

This document records the current implementation state of the Track Editor MVP in `rc-coach`.
It focuses on what is already present in the codebase, what is partially implemented or risky,
and what is still missing.

## Implemented

- Upload a track screenshot and move into quad selection: [`src/app/track-editor/track-editor.html`](../src/app/track-editor/track-editor.html), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- Import an existing session from `topdown.png` + `track.json` with **strict `schemaVersion v1` validation** (required fields, type checks, and version gate enforced; unversioned legacy files accepted with a warning): [`src/app/state/track-validation.ts`](../src/app/state/track-validation.ts), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts), [`src/app/track-types.ts`](../src/app/track-types.ts)
- Pick a 4-point quad, drag points to adjust them, and emit ordered TL/TR/BR/BL points: [`src/app/quad-picker/quad-picker.ts`](../src/app/quad-picker/quad-picker.ts), [`src/app/quad-picker/quad-picker.html`](../src/app/quad-picker/quad-picker.html), [`src/app/geometry/geometry.ts`](../src/app/geometry/geometry.ts)
- Warp the screenshot into a top-down canvas with OpenCV.js: [`src/app/opencv.ts`](../src/app/opencv.ts), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- Calibrate real-world scale with a manual two-point measurement flow and derived px/m: [`src/app/track-editor/track-editor.html`](../src/app/track-editor/track-editor.html), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- Annotate zones as rectangles or polygons, select them, retag them, delete them, and undo the last zone: [`src/app/topdown-annotator/topdown-annotator.ts`](../src/app/topdown-annotator/topdown-annotator.ts), [`src/app/topdown-annotator/topdown-annotator.html`](../src/app/topdown-annotator/topdown-annotator.html), [`src/app/geometry/zone-query.ts`](../src/app/geometry/zone-query.ts)
- **Zone vertex editing** on selected zones: drag individual vertices, insert new vertices by clicking zone edges, and delete vertices (minimum triangle preserved): [`src/app/topdown-annotator/topdown-annotator.ts`](../src/app/topdown-annotator/topdown-annotator.ts)
- Edit a centerline by adding, dragging, undoing, and clearing points: [`src/app/centerline-editor/centerline-editor.ts`](../src/app/centerline-editor/centerline-editor.ts), [`src/app/centerline-editor/centerline-editor.html`](../src/app/centerline-editor/centerline-editor.html)
- **Derived centerline geometry** (arc lengths, cumulative distance, tangent/normal vectors) computed from stored centerline points for the follower demo: [`src/app/geometry/derived-centerline.ts`](../src/app/geometry/derived-centerline.ts), [`src/app/geometry/centerline-params.ts`](../src/app/geometry/centerline-params.ts)
- Export `topdown.png` and `track.json` (with `schemaVersion: 1`): [`src/app/state/track-store.ts`](../src/app/state/track-store.ts), [`src/app/track-types.ts`](../src/app/track-types.ts), [`src/app/track-editor/track-editor.html`](../src/app/track-editor/track-editor.html)
- Show a centerline follower demo with steering and speed controls inside the editor flow: [`src/app/centerline-demo/centerline-demo.ts`](../src/app/centerline-demo/centerline-demo.ts), [`src/app/centerline-demo/centerline-demo.html`](../src/app/centerline-demo/centerline-demo.html), [`src/app/track-editor/track-editor.html`](../src/app/track-editor/track-editor.html)

## Partial or Suspicious

- OpenCV warp failures can fall back to a plain draw path when the quad is invalid or the warped canvas looks blank, which can hide the root cause from the user: [`src/app/opencv.ts`](../src/app/opencv.ts), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- Scale calibration uses a single pixels-per-meter value for both width and height, which is simple but assumes isotropic scaling across the rectified plane: [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- Centerline geometry helpers and the demo assume the line can be parameterized for follower math, so open-track semantics or loop handling should be treated carefully: [`src/app/geometry/centerline-params.ts`](../src/app/geometry/centerline-params.ts), [`src/app/centerline-demo/centerline-demo.ts`](../src/app/centerline-demo/centerline-demo.ts)
- The demo is embedded in the editor workflow rather than exposed as a separate viewer route or standalone page: [`src/app/track-editor/track-editor.html`](../src/app/track-editor/track-editor.html), [`src/app/app.routes.ts`](../src/app/app.routes.ts)

## Missing

- No persistent backend storage or sync layer for saved tracks (tracked in [issue #57](https://github.com/benhalverson/rc-coach/issues/57)): [`README.md`](../README.md), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- No advanced zone tooling such as snapping, richer parameters, or spline-based shape creation (tracked in [issue #56](https://github.com/benhalverson/rc-coach/issues/56)): [`src/app/topdown-annotator/topdown-annotator.ts`](../src/app/topdown-annotator/topdown-annotator.ts)
- No centerline smoothing or higher-level editing tools beyond add/drag/undo/clear (tracked in [issue #56](https://github.com/benhalverson/rc-coach/issues/56)): [`src/app/centerline-editor/centerline-editor.ts`](../src/app/centerline-editor/centerline-editor.ts)
- No dedicated standalone viewer page separate from the export step (tracked in [issue #55](https://github.com/benhalverson/rc-coach/issues/55)): [`src/app/track-editor/track-editor.html`](../src/app/track-editor/track-editor.html), [`src/app/centerline-demo/centerline-demo.ts`](../src/app/centerline-demo/centerline-demo.ts)

## Workflow Map

- Upload / import: [`src/app/track-editor/track-editor.html`](../src/app/track-editor/track-editor.html), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- Quad selection: [`src/app/quad-picker/quad-picker.ts`](../src/app/quad-picker/quad-picker.ts), [`src/app/quad-picker/quad-picker.html`](../src/app/quad-picker/quad-picker.html), [`src/app/geometry/geometry.ts`](../src/app/geometry/geometry.ts)
- OpenCV warp: [`src/app/opencv.ts`](../src/app/opencv.ts), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- Scale calibration: [`src/app/track-editor/track-editor.html`](../src/app/track-editor/track-editor.html), [`src/app/state/track-store.ts`](../src/app/state/track-store.ts)
- Annotation: [`src/app/topdown-annotator/topdown-annotator.ts`](../src/app/topdown-annotator/topdown-annotator.ts), [`src/app/topdown-annotator/topdown-annotator.html`](../src/app/topdown-annotator/topdown-annotator.html), [`src/app/geometry/zone-query.ts`](../src/app/geometry/zone-query.ts)
- Centerline editing: [`src/app/centerline-editor/centerline-editor.ts`](../src/app/centerline-editor/centerline-editor.ts), [`src/app/geometry/centerline-params.ts`](../src/app/geometry/centerline-params.ts)
- Export / import: [`src/app/state/track-store.ts`](../src/app/state/track-store.ts), [`src/app/track-types.ts`](../src/app/track-types.ts)
- Viewer / demo: [`src/app/centerline-demo/centerline-demo.ts`](../src/app/centerline-demo/centerline-demo.ts), [`src/app/centerline-demo/centerline-demo.html`](../src/app/centerline-demo/centerline-demo.html)

## Runtime And Build Risks

- `src/app/opencv.ts` loads `/assets/opencv/opencv.js` at runtime. If that asset or its wasm companion is missing from the deployed bundle, warp will fail.
- `src/app/state/track-store.ts` uses browser-only APIs such as `Image`, `FileReader`, `URL`, and `document` for import/export flows. Those paths must stay gated to client interaction.
- `src/app/centerline-demo/centerline-demo.ts` installs animation and keyboard listeners, so lifecycle cleanup and browser availability matter for SSR and test environments.
- `src/app/state/track-store.ts` converts the top-down canvas to a data URL for preview, which is simple but can be expensive for large canvases.
- Local verification on 2026-05-08 confirmed `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, and `pnpm start` work from the repo root.
- Local verification on 2026-05-08 also confirmed `pnpm cf-typegen` is currently blocked on Node.js `20.20.2` because `wrangler types` now requires Node.js `>=22`.
- There is currently no `pnpm lint` script in `package.json`. Use [Biome](https://biomejs.dev/) directly (`pnpm exec biome check .`) for formatting and linting. Configuration is in `biome.json`.

## Notes

- This document is intentionally descriptive only. It does not change product behavior.
- The current MVP is still a single-route editor driven from [`src/app/app.routes.ts`](../src/app/app.routes.ts).

