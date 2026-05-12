import { computed, effect, Injectable, inject, signal } from '@angular/core';
import { orderQuadTLTRBRBLv2, validateQuadTLTRBRBL, type Pt } from '../geometry/geometry';
import { Opencv } from '../opencv';
import type { TrackDef, Vec2, Zone } from '../track-types';
import { getTrackExportErrors } from './track-validation';

/** Returns true only when v is a finite number greater than zero. */
export function isValidDimension(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export type Step =
	| 'scale'
	| 'upload'
	| 'quad'
	| 'annotate'
	| 'export'
	| 'centerline'
	| 'viewer';

@Injectable({ providedIn: 'root' })
export class TrackStore {
	private readonly cv = inject(Opencv);

	readonly step = signal<Step>('upload');

	readonly srcImage = signal<HTMLImageElement | null>(null);
	readonly srcImageName = signal<string>('track.png');
	readonly quadPx = signal<Pt[] | null>(null);
	readonly quadError = signal<string | null>(null);

	readonly topDown = signal<HTMLCanvasElement | null>(null);
	readonly warpError = signal<string | null>(null);
	readonly topDownDataUrl = signal<string | null>(null);
	readonly topDownW = signal(1600);
	readonly topDownH = signal(900);

	readonly name = signal('RC Track');
	readonly widthMeters = signal(20);
	readonly heightMeters = signal(12);

	readonly zones = signal<Zone[]>([]);
	readonly centerline = signal<Vec2[]>([]);
	readonly centerlinePointsSvg = computed(() =>
		this.centerline()
			.map((p) => `${p[0] * 100},${p[1] * 100}`)
			.join(' '),
	);

	// Scale calibration via measurement
	readonly measureMode = signal(false);
	readonly measurePt1 = signal<Pt | null>(null);
	readonly measurePt2 = signal<Pt | null>(null);
	readonly measurePixelDist = computed(() => {
		const p1 = this.measurePt1();
		const p2 = this.measurePt2();
		if (!p1 || !p2) return null;
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		return Math.hypot(dx, dy);
	});
	readonly measureRealDist = signal(0);
	readonly pixelsPerMeter = computed(() => {
		const pxDist = this.measurePixelDist();
		const realDist = this.measureRealDist();
		if (!pxDist || !Number.isFinite(pxDist) || pxDist <= 0) return null;
		if (!Number.isFinite(realDist) || realDist <= 0) return null;
		const ppm = pxDist / realDist;
		return Number.isFinite(ppm) && ppm > 0 ? ppm : null;
	});

	/**
	 * Initialize derived state effects (e.g., `topDownDataUrl`).
	 * Converts the `topDown` canvas into a PNG data URL whenever it changes.
	 */
	constructor() {
		effect(() => {
			const top = this.topDown();
			if (!top || top.width === 0 || top.height === 0) {
				this.topDownDataUrl.set(null);
				return;
			}
			const url = top.toDataURL('image/png');
			this.topDownDataUrl.set(url);
		});
	}

	readonly canGoAnnotate = computed(
		() =>
			!!this.topDown() &&
			this.scaleValid() &&
			this.name().trim().length > 0,
	);

	readonly canGoAnnotateHint = computed<string | null>(() => {
		if (this.canGoAnnotate()) return null;
		const missing: string[] = [];
		if (!this.topDown()) missing.push('top-down image');
		if (!this.name().trim()) missing.push('track name');
		if (!this.scaleValid()) missing.push('valid dimensions');
		return missing.length ? `Missing: ${missing.join(', ')}.` : null;
	});

	readonly scaleErrors = computed(() => {
		const errors: string[] = [];
		const w = this.widthMeters();
		const h = this.heightMeters();
		if (!isValidDimension(w)) {
			errors.push('Width must be a positive finite number.');
		}
		if (!isValidDimension(h)) {
			errors.push('Height must be a positive finite number.');
		}
		return errors;
	});

	readonly scaleValid = computed(() => this.scaleErrors().length === 0);

	readonly trackDef = computed<TrackDef | null>(() => {
		const top = this.topDown();
		if (!top) return null;

		const quad = this.quadPx();

		const def: TrackDef = {
			id: crypto.randomUUID(),
			name: this.name().trim(),
			widthMeters: this.widthMeters(),
			heightMeters: this.heightMeters(),
			topdownPx: { w: top.width, h: top.height },
			zones: this.zones(),
			centerline: this.centerline(),
		};

		if (quad) {
			def.import = {
				srcImageName: this.srcImageName(),
				srcQuadPx: quad,
			};
		}

		return def;
	});

	readonly exportErrors = computed(() =>
		getTrackExportErrors({
			track: this.trackDef(),
			hasTopDown: !!this.topDown(),
			hasQuad: !!this.quadPx(),
			hasSourceImage: !!this.srcImage(),
		}),
	);

	readonly exportValid = computed(() => this.exportErrors().length === 0);

	// Actions
	/**
	 * Handle image file selection for the source screenshot.
	 * Sets `srcImage`, clears previous warp state, and advances to the quad step.
	 * @param ev change event from an `<input type="file">` control.
	 */
	onFile(ev: Event) {
		const input = ev.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		this.srcImageName.set(file.name);

		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			this.srcImage.set(img);
			this.quadPx.set(null);
			this.quadError.set(null);
			this.warpError.set(null);
			this.topDown.set(null);
			this.zones.set([]);
			this.step.set('quad');
		};
		img.src = url;
	}

	/**
	 * Accept user-picked quad points and run perspective warp to generate `topDown`.
	 * Validates the quad (4 points, convex, non-degenerate) before ordering and warping.
	 * Ensures TL/TR/BR/BL ordering and falls back to simple draw if OpenCV warp fails.
	 * @param rawPts four points picked on the source image (any order).
	 */
	async onQuad(rawPts: Pt[]) {
		const img = this.srcImage();
		if (!img) return;

		this.warpError.set(null);

		const orderedv2 = orderQuadTLTRBRBLv2(rawPts);

		const w = img.naturalWidth || img.width;
		const h = img.naturalHeight || img.height;
		const validation = validateQuadTLTRBRBL(orderedv2, w, h);
		if (!validation.ok) {
			this.quadError.set(validation.reason);
			return;
		}
		this.quadError.set(null);

		this.quadPx.set(orderedv2);

		try {
			await this.cv.ready();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.warpError.set(`OpenCV failed to load: ${msg}`);
			return;
		}

		const outW = this.topDownW();
		const outH = this.topDownH();

		let canvas: HTMLCanvasElement;
		let warpFailed = false;
		try {
			canvas = this.cv.warpPerspective(img, orderedv2, outW, outH);
		} catch (err) {
			console.error('warpPerspective failed', err);
			canvas = this.fallbackDraw(img, outW, outH);
			warpFailed = true;
		}

		const blankAfterWarp = this.isMostlyBlankCanvas(canvas);
		if (blankAfterWarp) {
			canvas = this.fallbackDraw(img, outW, outH);
			this.quadError.set(
				'Warp produced a blank result — using a scaled fallback. Try moving the corner handles further apart.',
			);
		} else if (warpFailed) {
			this.quadError.set(
				'Perspective warp failed — using a scaled fallback. Check that all four corners are placed correctly.',
			);
		}

		this.topDown.set(canvas);
		this.step.set('scale');
	}

	/**
	 * Reset the editor to its initial state and clear all session data.
	 */
	resetAll() {
		this.step.set('upload');
		this.srcImage.set(null);
		this.quadPx.set(null);
		this.quadError.set(null);
		this.topDown.set(null);
		this.warpError.set(null);
		this.zones.set([]);
		this.centerline.set([]);
		this.measureMode.set(false);
		this.measurePt1.set(null);
		this.measurePt2.set(null);
		this.measureRealDist.set(0);
		this.importTopdownImg.set(null);
		this.importTrack.set(null);
		this.importJsonError.set(null);
		this.importPngError.set(null);
	}

	/**
	 * Collect measurement points on the top-down image while in measure mode.
	 * @param ev mouse event from the image element.
	 * @param canvas the image element used for coordinate conversion.
	 */
	onMeasureCanvasClick(ev: MouseEvent, canvas: HTMLCanvasElement) {
		if (!this.measureMode()) return;
		const rect = canvas.getBoundingClientRect();
		const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
		const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
		const pt = { x, y };

		if (!this.measurePt1()) {
			this.measurePt1.set(pt);
		} else if (!this.measurePt2()) {
			this.measurePt2.set(pt);
		}
	}

	/**
	 * Apply measured pixels-per-meter to derive track dimensions from the top-down.
	 * Uses `pixelsPerMeter` to set `widthMeters` and `heightMeters`.
	 */
	applyMeasure() {
		const ppm = this.pixelsPerMeter();
		const top = this.topDown();
		if (!ppm || !top) return;

		const w = top.width / ppm;
		const h = top.height / ppm;
		if (!isValidDimension(w) || !isValidDimension(h)) return;
		this.widthMeters.set(w);
		this.heightMeters.set(h);
		this.measureMode.set(false);
		this.measurePt1.set(null);
		this.measurePt2.set(null);
		this.measureRealDist.set(0);
	}

	/**
	 * Exit measurement mode and clear measurement points and distance.
	 */
	cancelMeasure() {
		this.measureMode.set(false);
		this.measurePt1.set(null);
		this.measurePt2.set(null);
		this.measureRealDist.set(0);
	}

	/**
	 * Trigger download of the current `topDown` canvas as `topdown.png`.
	 */
	downloadTopdownPng() {
		const top = this.topDown();
		if (!top) return;

		top.toBlob((blob) => {
			if (!blob) return;
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = 'topdown.png';
			a.click();
			URL.revokeObjectURL(a.href);
		}, 'image/png');
	}

	/**
	 * Trigger download of the current `trackDef` as `track.json`.
	 * Guarded by `exportValid` and requires `trackDef` to exist.
	 */
	downloadTrackJson() {
		const t = this.trackDef();
		if (!t || !this.exportValid()) return;

		const blob = new Blob([JSON.stringify(t, null, 2)], {
			type: 'application/json',
		});
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'track.json';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	/**
	 * Count zones by type for quick stats in the UI.
	 * @param type zone category to count.
	 * @returns number of zones of the given type.
	 */
	countZonesByType(type: 'jump' | 'wallride'): number {
		return this.zones().filter((z) => z.type === type).length;
	}

	/**
	 * Update the centerline with a new polyline definition.
	 * @param line normalized `[x,y]` points in order.
	 */
	onCenterlineChange(line: Vec2[]) {
		this.centerline.set(line);
	}

	// Import session support
	readonly importTopdownImg = signal<HTMLImageElement | null>(null);
	readonly importTrack = signal<TrackDef | null>(null);
	readonly importJsonError = signal<string | null>(null);
	readonly importPngError = signal<string | null>(null);
	readonly canImport = computed(
		() => !!this.importTopdownImg() && !!this.importTrack(),
	);
	readonly pixelsPerMeterAuto = computed(() => {
		const t = this.importTrack();
		if (!t) return null;
		const ppmX = t.topdownPx.w / t.widthMeters;
		const ppmY = t.topdownPx.h / t.heightMeters;
		return (ppmX + ppmY) / 2;
	});

	/**
	 * Handle selection of an existing top-down PNG for import.
	 * Sets `importTopdownImg` once the image loads, or sets `importPngError` on failure.
	 * @param ev change event from a PNG file input.
	 */
	onImportTopdownFile(ev: Event) {
		const input = ev.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		this.importPngError.set(null);
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			this.importTopdownImg.set(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			this.importPngError.set('Failed to load image. Make sure the file is a valid PNG.');
		};
		img.src = url;
	}

	/**
	 * Handle selection of a previously exported `track.json` for import.
	 * Parses and validates shape, then sets `importTrack` or `importJsonError`.
	 * @param ev change event from a JSON file input.
	 */
	onImportTrackJsonFile(ev: Event) {
		const input = ev.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		this.importJsonError.set(null);
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const raw = reader.result as string;
				const json = JSON.parse(raw) as TrackDef;
				if (
					!json ||
					typeof json !== 'object' ||
					!json.topdownPx ||
					!isValidDimension(json.topdownPx.w) ||
					!isValidDimension(json.topdownPx.h) ||
					!isValidDimension(json.widthMeters) ||
					!isValidDimension(json.heightMeters) ||
					typeof json.name !== 'string'
				) {
					this.importJsonError.set(
						'Invalid track.json: file must contain name, widthMeters, heightMeters, and topdownPx fields.',
					);
					return;
				}
				// Discard zones that are structurally invalid (< 3 points)
				if (Array.isArray(json.zones)) {
					json.zones = json.zones.filter(
						(z: Zone) =>
							z && z.id && z.type && Array.isArray(z.poly) && z.poly.length >= 3,
					);
				} else {
					json.zones = [];
				}
				this.importTrack.set(json);
				this.importJsonError.set(null);
			} catch {
				this.importJsonError.set('Failed to parse track.json: file is not valid JSON.');
			}
		};
		reader.readAsText(file);
	}

	/**
	 * Apply an imported session (PNG + JSON) to the editor state.
	 * Rehydrates name, dimensions, zones, centerline, and creates the `topDown` canvas.
	 * Zones with fewer than 3 polygon points are silently discarded.
	 */
	applyImport() {
		const img = this.importTopdownImg();
		const t = this.importTrack();
		if (!img || !t) return;

		this.name.set(t.name);
		this.widthMeters.set(t.widthMeters);
		this.heightMeters.set(t.heightMeters);
		// Filter out any malformed zones before storing
		const validZones = (t.zones ?? []).filter(
			(z) => z && z.id && z.type && Array.isArray(z.poly) && z.poly.length >= 3,
		);
		this.zones.set(validZones);
		this.centerline.set(t.centerline ?? []);
		this.srcImageName.set(t.import?.srcImageName ?? this.srcImageName());
		this.quadPx.set(t.import?.srcQuadPx ?? null);

		const c = document.createElement('canvas');
		c.width = t.topdownPx.w;
		c.height = t.topdownPx.h;
		const ctx = c.getContext('2d');
		if (ctx) ctx.drawImage(img, 0, 0, c.width, c.height);
		this.topDown.set(c);
		this.topDownW.set(c.width);
		this.topDownH.set(c.height);

		this.importTopdownImg.set(null);
		this.importTrack.set(null);
		this.importJsonError.set(null);
		this.importPngError.set(null);
		this.step.set('annotate');
	}

	/**
	 * Fallback renderer when warp fails: draws source image scaled onto a new canvas.
	 * @param img source image element.
	 * @param w output canvas width in pixels.
	 * @param h output canvas height in pixels.
	 * @returns a new canvas with the image drawn.
	 */
	private fallbackDraw(
		img: HTMLImageElement,
		w: number,
		h: number,
	): HTMLCanvasElement {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const ctx = c.getContext('2d');
		if (ctx) ctx.drawImage(img, 0, 0, w, h);
		return c;
	}

	/**
	 * Heuristic to detect a blank canvas by sampling a small region for non-zero pixels.
	 * @param c canvas to inspect.
	 * @returns true if all sampled pixels are zero; otherwise false.
	 */
	private isBlankCanvas(c: HTMLCanvasElement): boolean {
		const ctx = c.getContext('2d');
		if (!ctx) return true;
		const sampleW = Math.min(8, c.width || 1);
		const sampleH = Math.min(8, c.height || 1);
		const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
		for (let i = 0; i < data.length; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			if (r !== 0 || g !== 0 || b !== 0) return false;
		}
		return true;
	}

	private isMostlyBlankCanvas(
		c: HTMLCanvasElement,
		nonBlackRatioMin = 0.01,
	): boolean {
		const s = document.createElement('canvas');
		s.width = 32;
		s.height = 32;

		const sctx = s.getContext('2d', { willReadFrequently: true });
		if (!sctx) return false; // Cannot sample — assume not blank

		sctx.drawImage(c, 0, 0, s.width, s.height);
		const data = sctx.getImageData(0, 0, s.width, s.height).data;

		let nonBlack = 0;
		const total = s.width * s.height;

		for (let i = 0; i < data.length; i += 4) {
			const r = data[i],
				g = data[i + 1],
				b = data[i + 2],
				a = data[i + 3];

			if (a > 0 && r + g + b > 15) nonBlack++;
		}

		return nonBlack / total < nonBlackRatioMin;
	}
}
