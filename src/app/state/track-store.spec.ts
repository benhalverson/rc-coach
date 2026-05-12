import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Opencv } from '../opencv';
import { TRACK_SCHEMA_VERSION, type TrackDef } from '../track-types';
import { isValidDimension, TrackStore } from './track-store';

const VALID_TRACK_DEF: TrackDef = {
	schemaVersion: TRACK_SCHEMA_VERSION,
	id: 'test-id',
	name: 'Test Track',
	widthMeters: 20,
	heightMeters: 12,
	topdownPx: { w: 800, h: 450 },
	zones: [
		{
			id: 'z1',
			type: 'jump',
			poly: [
				[0.1, 0.1],
				[0.3, 0.1],
				[0.3, 0.3],
				[0.1, 0.3],
			],
		},
	],
	centerline: [
		[0.1, 0.5],
		[0.5, 0.5],
		[0.9, 0.5],
	],
	import: {
		srcImageName: 'screenshot.png',
		srcQuadPx: [
			{ x: 0, y: 0 },
			{ x: 800, y: 0 },
			{ x: 800, y: 450 },
			{ x: 0, y: 450 },
		],
	},
};

/** Build a fake Event carrying a single File. */
function makeFileEvent(file: File): Event {
	const input = document.createElement('input');
	input.type = 'file';
	// jsdom does not expose DataTransfer, so we mock the files list directly.
	Object.defineProperty(input, 'files', {
		value: {
			0: file,
			length: 1,
			item: (i: number) => (i === 0 ? file : null),
			[Symbol.iterator]: function* () {
				yield file;
			},
		} as unknown as FileList,
		configurable: true,
	});
	return { target: input } as unknown as Event;
}

function makeImage(w: number, h: number): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true });
	Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true });
	return img;
}

function makeCanvas(w = 1600, h = 900): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return c;
}

const VALID_IMPORT_META = {
	srcImageName: 'x.png',
	srcQuadPx: [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 100 },
		{ x: 0, y: 100 },
	],
};

describe('isValidDimension', () => {
	it('returns true for positive finite numbers', () => {
		expect(isValidDimension(1)).toBe(true);
		expect(isValidDimension(0.01)).toBe(true);
		expect(isValidDimension(1000)).toBe(true);
	});

	it('returns false for zero', () => {
		expect(isValidDimension(0)).toBe(false);
	});

	it('returns false for negative numbers', () => {
		expect(isValidDimension(-1)).toBe(false);
		expect(isValidDimension(-0.001)).toBe(false);
	});

	it('returns false for NaN', () => {
		expect(isValidDimension(Number.NaN)).toBe(false);
	});

	it('returns false for Infinity', () => {
		expect(isValidDimension(Number.POSITIVE_INFINITY)).toBe(false);
		expect(isValidDimension(Number.NEGATIVE_INFINITY)).toBe(false);
	});

	it('returns false for non-number types', () => {
		expect(isValidDimension(null)).toBe(false);
		expect(isValidDimension(undefined)).toBe(false);
		expect(isValidDimension('5')).toBe(false);
	});
});

describe('TrackStore – quad validation', () => {
	let store: TrackStore;
	let warpSpy: ReturnType<typeof vi.fn>;
	let readySpy: ReturnType<typeof vi.fn>;

	// A valid TL/TR/BR/BL quad well inside a 1600×900 image
	const validQuad = [
		{ x: 100, y: 100 },
		{ x: 1500, y: 100 },
		{ x: 1500, y: 800 },
		{ x: 100, y: 800 },
	];

	beforeEach(() => {
		readySpy = vi.fn().mockResolvedValue(undefined);
		warpSpy = vi.fn().mockReturnValue(makeCanvas());

		TestBed.configureTestingModule({
			providers: [
				TrackStore,
				{
					provide: Opencv,
					useValue: {
						ready: readySpy,
						warpPerspective: warpSpy,
					},
				},
			],
		});

		store = TestBed.inject(TrackStore);

		// Seed a source image so onQuad can proceed past the early-exit guard
		store.srcImage.set(makeImage(1600, 900));
		store.step.set('quad');
	});

	it('should be created', () => {
		expect(store).toBeTruthy();
	});

	// ── JSON import ──────────────────────────────────────────────────────────

	it('onImportTrackJsonFile: sets importTrack for valid JSON', async () => {
		const json = JSON.stringify(VALID_TRACK_DEF);
		const file = new File([json], 'track.json', { type: 'application/json' });
		const ev = makeFileEvent(file);

		store.onImportTrackJsonFile(ev);
		// Allow FileReader to complete (microtask + possible macrotask)
		await new Promise((r) => setTimeout(r, 50));

		expect(store.importTrack()).toEqual(VALID_TRACK_DEF);
		expect(store.importJsonError()).toBeNull();
	});

	it('onImportTrackJsonFile: sets importJsonError for malformed JSON', async () => {
		const file = new File(['not-valid-json{{{'], 'track.json', {
			type: 'application/json',
		});
		const ev = makeFileEvent(file);

		store.onImportTrackJsonFile(ev);
		await new Promise((r) => setTimeout(r, 50));

		expect(store.importTrack()).toBeNull();
		expect(store.importJsonError()).toMatch(/not valid JSON/i);
	});

	it('onImportTrackJsonFile: sets importJsonError for JSON missing required fields', async () => {
		const partial = { id: 'x', name: 'oops' }; // missing topdownPx, widthMeters, heightMeters
		const file = new File([JSON.stringify(partial)], 'track.json', {
			type: 'application/json',
		});
		const ev = makeFileEvent(file);

		store.onImportTrackJsonFile(ev);
		await new Promise((r) => setTimeout(r, 50));

		expect(store.importTrack()).toBeNull();
		expect(store.importJsonError()).toMatch(/topdownPx is required/i);
	});

	it('onImportTrackJsonFile: clears previous importJsonError on new attempt', async () => {
		// Set an error first
		const badFile = new File(['{bad'], 'track.json', {
			type: 'application/json',
		});
		store.onImportTrackJsonFile(makeFileEvent(badFile));
		await new Promise((r) => setTimeout(r, 50));
		expect(store.importJsonError()).not.toBeNull();

		// Now provide valid JSON
		const goodFile = new File([JSON.stringify(VALID_TRACK_DEF)], 'track.json', {
			type: 'application/json',
		});
		store.onImportTrackJsonFile(makeFileEvent(goodFile));
		await new Promise((r) => setTimeout(r, 50));

		expect(store.importJsonError()).toBeNull();
		expect(store.importTrack()).toEqual(VALID_TRACK_DEF);
	});

	// ── applyImport ───────────────────────────────────────────────────────────

	it('applyImport: restores state from imported track + image', () => {
		// Fake an HTMLImageElement with width/height matching topdownPx
		const fakeImg = { width: 800, height: 450 } as HTMLImageElement;

		store.importTopdownImg.set(fakeImg);
		store.importTrack.set(VALID_TRACK_DEF);

		store.applyImport();

		expect(store.name()).toBe('Test Track');
		expect(store.trackId()).toBe('test-id');
		expect(store.widthMeters()).toBe(20);
		expect(store.heightMeters()).toBe(12);
		expect(store.zones()).toEqual(VALID_TRACK_DEF.zones);
		expect(store.centerline()).toEqual(VALID_TRACK_DEF.centerline);
		expect(store.srcImageName()).toBe('screenshot.png');
		expect(store.step()).toBe('annotate');
	});

	it('applyImport: trackDef is non-null after import (round-trip)', () => {
		const fakeImg = { width: 800, height: 450 } as HTMLImageElement;

		store.importTopdownImg.set(fakeImg);
		store.importTrack.set(VALID_TRACK_DEF);

		store.applyImport();

		// trackDef must be non-null so re-export is possible
		const def = store.trackDef();
		expect(def).not.toBeNull();
		expect(def?.name).toBe('Test Track');
		expect(def?.widthMeters).toBe(20);
		expect(def?.heightMeters).toBe(12);
		expect(def?.topdownPx.w).toBe(800);
		expect(def?.topdownPx.h).toBe(450);
	});

	it('applyImport: preserves import metadata in re-exported trackDef', () => {
		const fakeImg = { width: 800, height: 450 } as HTMLImageElement;

		store.importTopdownImg.set(fakeImg);
		store.importTrack.set(VALID_TRACK_DEF);

		store.applyImport();

		const def = store.trackDef();
		expect(def?.import?.srcImageName).toBe('screenshot.png');
		expect(def?.import?.srcQuadPx).toEqual(VALID_TRACK_DEF.import?.srcQuadPx);
	});

	it('applyImport: clears importTopdownImg and importTrack signals after apply', () => {
		const fakeImg = { width: 800, height: 450 } as HTMLImageElement;

		store.importTopdownImg.set(fakeImg);
		store.importTrack.set(VALID_TRACK_DEF);

		store.applyImport();

		expect(store.importTopdownImg()).toBeNull();
		expect(store.importTrack()).toBeNull();
	});

	// ── resetAll ─────────────────────────────────────────────────────────────

	it('resetAll: clears importJsonError and importPngError', async () => {
		// Trigger a JSON error
		const file = new File(['{bad'], 'track.json', { type: 'application/json' });
		store.onImportTrackJsonFile(makeFileEvent(file));
		await new Promise((r) => setTimeout(r, 50));
		expect(store.importJsonError()).not.toBeNull();

		store.resetAll();

		expect(store.importJsonError()).toBeNull();
		expect(store.importPngError()).toBeNull();
		expect(store.step()).toBe('upload');
	});

	// ── trackDef guard ────────────────────────────────────────────────────────

	it('trackDef: returns null when topDown is not set', () => {
		expect(store.trackDef()).toBeNull();
	});

	it('trackDef: omits import field when quadPx is null', () => {
		// Set up a minimal topDown canvas (jsdom returns null from getContext,
		// but we can test the signal logic directly)
		const canvas = document.createElement('canvas');
		canvas.width = 400;
		canvas.height = 300;

		store.topDown.set(canvas);
		store.name.set('My Track');
		store.widthMeters.set(15);
		store.heightMeters.set(10);
		// quadPx is null by default

		const def = store.trackDef();
		expect(def).not.toBeNull();
		expect(def?.schemaVersion).toBe(TRACK_SCHEMA_VERSION);
		expect(def?.import).toBeUndefined();
	});

	it('trackDef: keeps a stable id across repeated reads', () => {
		store.topDown.set(makeCanvas(400, 300));
		store.name.set('My Track');

		const first = store.trackDef()?.id;
		const second = store.trackDef()?.id;

		expect(first).toBeTruthy();
		expect(second).toBe(first);
	});

	it('trackDef: exports raw centerline while derivedCenterline remains internal', () => {
		const raw: [number, number][] = [
			[0, 0.5],
			[0.5, 0.1],
			[1, 0.5],
		];
		store.topDown.set(makeCanvas(400, 300));
		store.centerline.set(raw);

		const def = store.trackDef();

		expect(def?.centerline).toEqual(raw);
		expect(store.derivedCenterline()?.sampledPoints.length).toBeGreaterThan(
			raw.length,
		);
		expect(def).not.toHaveProperty('derivedCenterline');
	});

	it('quadError starts as null', () => {
		expect(store.quadError()).toBeNull();
	});

	it('warpError starts as null', () => {
		expect(store.warpError()).toBeNull();
	});

	it('sets quadError and stays on quad step when points are too close', async () => {
		const tooCloseQuad = [
			{ x: 100, y: 100 },
			{ x: 105, y: 100 }, // only 5 px from first point
			{ x: 1500, y: 800 },
			{ x: 100, y: 800 },
		];
		await TestBed.runInInjectionContext(() => store.onQuad(tooCloseQuad));
		expect(store.quadError()).toBeTruthy();
		expect(store.step()).toBe('quad');
	});

	it('does NOT call OpenCV warpPerspective for an invalid quad', async () => {
		const tooCloseQuad = [
			{ x: 100, y: 100 },
			{ x: 105, y: 100 },
			{ x: 1500, y: 800 },
			{ x: 100, y: 800 },
		];
		await TestBed.runInInjectionContext(() => store.onQuad(tooCloseQuad));
		expect(warpSpy).not.toHaveBeenCalled();
	});

	it('sets quadError for a quad with a point outside image bounds', async () => {
		// One point is beyond the 1600×900 image boundary
		const outOfBounds = [
			{ x: 100, y: 100 },
			{ x: 1650, y: 100 }, // x > 1600
			{ x: 1500, y: 800 },
			{ x: 100, y: 800 },
		];
		await TestBed.runInInjectionContext(() => store.onQuad(outOfBounds));
		expect(store.quadError()).toBeTruthy();
		expect(store.step()).toBe('quad');
	});

	it('sets quadError for a degenerate (tiny area) quad', async () => {
		const tiny = [
			{ x: 100, y: 100 },
			{ x: 150, y: 100 },
			{ x: 150, y: 150 },
			{ x: 100, y: 150 },
		]; // area = 50×50 = 2500 px² < 5000 minimum
		await TestBed.runInInjectionContext(() => store.onQuad(tiny));
		expect(store.quadError()).toBeTruthy();
		expect(store.step()).toBe('quad');
	});

	it('advances to scale step for a valid quad', async () => {
		// Seed an error first from an invalid quad
		const bad = [
			{ x: 100, y: 100 },
			{ x: 105, y: 100 },
			{ x: 1500, y: 800 },
			{ x: 100, y: 800 },
		];
		await TestBed.runInInjectionContext(() => store.onQuad(bad));
		expect(store.quadError()).toBeTruthy();

		await TestBed.runInInjectionContext(() => store.onQuad(validQuad));
		// In jsdom canvas.getContext() is unavailable so isMostlyBlankCanvas returns true
		// and a warp-fallback notice is set. The step still advances to 'scale'.
		expect(store.step()).toBe('scale');
	});

	it('calls OpenCV warpPerspective for a valid quad', async () => {
		await TestBed.runInInjectionContext(() => store.onQuad(validQuad));
		expect(warpSpy).toHaveBeenCalledOnce();
	});

	it('resetAll clears quadError', async () => {
		const bad = [
			{ x: 100, y: 100 },
			{ x: 105, y: 100 },
			{ x: 1500, y: 800 },
			{ x: 100, y: 800 },
		];
		await TestBed.runInInjectionContext(() => store.onQuad(bad));
		store.resetAll();
		expect(store.quadError()).toBeNull();
	});

	it('sets warpError and stays on quad step when cv.ready() rejects', async () => {
		readySpy.mockRejectedValue(
			new Error('Failed to load /assets/opencv/opencv.js'),
		);

		await TestBed.runInInjectionContext(() => store.onQuad(validQuad));

		expect(store.warpError()).toContain('OpenCV failed to load');
		expect(store.step()).toBe('quad');
	});

	it('falls back and advances when warpPerspective throws', async () => {
		warpSpy.mockImplementation(() => {
			throw new Error('cv internal error');
		});

		await TestBed.runInInjectionContext(() => store.onQuad(validQuad));

		expect(store.quadError()).toContain('Perspective warp failed');
		expect(store.step()).toBe('scale');
	});

	it('resetAll clears warpError', () => {
		store.warpError.set('some error');
		store.resetAll();
		expect(store.warpError()).toBeNull();
	});
});

describe('TrackStore – scale calibration validation', () => {
	let store: TrackStore;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				TrackStore,
				{
					provide: Opencv,
					useValue: {
						ready: vi.fn().mockResolvedValue(undefined),
						warpPerspective: vi.fn().mockReturnValue(makeCanvas()),
					},
				},
			],
		});
		store = TestBed.inject(TrackStore);
	});

	describe('scaleErrors', () => {
		it('is empty with default valid dimensions', () => {
			expect(store.scaleErrors()).toEqual([]);
		});

		it('reports an error when width is zero', () => {
			store.widthMeters.set(0);
			expect(store.scaleErrors()).toContain(
				'Width must be a positive finite number.',
			);
		});

		it('reports an error when width is negative', () => {
			store.widthMeters.set(-5);
			expect(store.scaleErrors()).toContain(
				'Width must be a positive finite number.',
			);
		});

		it('reports an error when width is NaN', () => {
			store.widthMeters.set(Number.NaN);
			expect(store.scaleErrors()).toContain(
				'Width must be a positive finite number.',
			);
		});

		it('reports an error when width is Infinity', () => {
			store.widthMeters.set(Number.POSITIVE_INFINITY);
			expect(store.scaleErrors()).toContain(
				'Width must be a positive finite number.',
			);
		});

		it('reports an error when height is zero', () => {
			store.heightMeters.set(0);
			expect(store.scaleErrors()).toContain(
				'Height must be a positive finite number.',
			);
		});

		it('reports an error when height is negative', () => {
			store.heightMeters.set(-3);
			expect(store.scaleErrors()).toContain(
				'Height must be a positive finite number.',
			);
		});

		it('reports an error when height is NaN', () => {
			store.heightMeters.set(Number.NaN);
			expect(store.scaleErrors()).toContain(
				'Height must be a positive finite number.',
			);
		});

		it('reports both errors when both dimensions are invalid', () => {
			store.widthMeters.set(0);
			store.heightMeters.set(Number.NaN);
			expect(store.scaleErrors().length).toBe(2);
		});
	});

	describe('scaleValid', () => {
		it('is true with default valid dimensions', () => {
			expect(store.scaleValid()).toBe(true);
		});

		it('is false when width is invalid', () => {
			store.widthMeters.set(-1);
			expect(store.scaleValid()).toBe(false);
		});

		it('is false when height is invalid', () => {
			store.heightMeters.set(0);
			expect(store.scaleValid()).toBe(false);
		});
	});

	describe('pixelsPerMeter', () => {
		function setTwoPoints(x1: number, y1: number, x2: number, y2: number) {
			store.measurePt1.set({ x: x1, y: y1 });
			store.measurePt2.set({ x: x2, y: y2 });
		}

		it('is null when no points are set', () => {
			store.measureRealDist.set(5);
			expect(store.pixelsPerMeter()).toBeNull();
		});

		it('is null when real distance is zero', () => {
			setTwoPoints(0, 0, 100, 0);
			store.measureRealDist.set(0);
			expect(store.pixelsPerMeter()).toBeNull();
		});

		it('is null when real distance is negative', () => {
			setTwoPoints(0, 0, 100, 0);
			store.measureRealDist.set(-2);
			expect(store.pixelsPerMeter()).toBeNull();
		});

		it('is null when real distance is NaN', () => {
			setTwoPoints(0, 0, 100, 0);
			store.measureRealDist.set(Number.NaN);
			expect(store.pixelsPerMeter()).toBeNull();
		});

		it('returns correct ppm for valid inputs', () => {
			setTwoPoints(0, 0, 100, 0); // 100 px distance
			store.measureRealDist.set(5); // 5 metres
			expect(store.pixelsPerMeter()).toBeCloseTo(20, 5);
		});

		it('is null when pixel distance is zero (same point)', () => {
			setTwoPoints(50, 50, 50, 50);
			store.measureRealDist.set(5);
			expect(store.pixelsPerMeter()).toBeNull();
		});
	});

	describe('applyMeasure', () => {
		it('does not update dimensions when pixelsPerMeter is null', () => {
			store.widthMeters.set(20);
			store.heightMeters.set(12);
			store.applyMeasure();
			expect(store.widthMeters()).toBe(20);
			expect(store.heightMeters()).toBe(12);
		});

		it('does not update dimensions when topDown is null', () => {
			store.measurePt1.set({ x: 0, y: 0 });
			store.measurePt2.set({ x: 100, y: 0 });
			store.measureRealDist.set(5);
			store.applyMeasure();
			expect(store.widthMeters()).toBe(20);
			expect(store.heightMeters()).toBe(12);
		});
	});

	describe('exportErrors dimension validation', () => {
		it('contains dimension error when widthMeters is NaN', () => {
			store.topDown.set(makeCanvas(1600, 900));
			store.srcImage.set(makeImage(1600, 900));
			store.quadPx.set([
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
				{ x: 0, y: 1 },
			]);
			store.widthMeters.set(Number.NaN);

			expect(store.exportErrors()).toContain(
				'Track dimensions must be greater than 0.',
			);
		});
	});

	describe('canGoAnnotateHint', () => {
		it('returns null when canGoAnnotate is true', () => {
			store.topDown.set(makeCanvas(100, 100));
			store.name.set('My Track');
			store.widthMeters.set(10);
			store.heightMeters.set(8);

			expect(store.canGoAnnotate()).toBe(true);
			expect(store.canGoAnnotateHint()).toBeNull();
		});

		it('mentions missing top-down image when topDown is null', () => {
			store.topDown.set(null);
			store.name.set('My Track');
			store.widthMeters.set(10);
			store.heightMeters.set(8);

			const hint = store.canGoAnnotateHint();
			expect(hint).not.toBeNull();
			expect(hint).toContain('top-down image');
		});

		it('mentions missing track name when name is empty', () => {
			store.topDown.set(makeCanvas(100, 100));
			store.name.set('');
			store.widthMeters.set(10);
			store.heightMeters.set(8);

			const hint = store.canGoAnnotateHint();
			expect(hint).not.toBeNull();
			expect(hint).toContain('track name');
		});

		it('mentions invalid dimensions when width is 0', () => {
			store.topDown.set(makeCanvas(100, 100));
			store.name.set('My Track');
			store.widthMeters.set(0);
			store.heightMeters.set(8);

			const hint = store.canGoAnnotateHint();
			expect(hint).not.toBeNull();
			expect(hint).toContain('valid dimensions');
		});

		it('mentions invalid dimensions when height is 0', () => {
			store.topDown.set(makeCanvas(100, 100));
			store.name.set('My Track');
			store.widthMeters.set(10);
			store.heightMeters.set(0);

			const hint = store.canGoAnnotateHint();
			expect(hint).not.toBeNull();
			expect(hint).toContain('valid dimensions');
		});
	});

	describe('import file errors', () => {
		it('initialises as null', () => {
			expect(store.importJsonError()).toBeNull();
			expect(store.importPngError()).toBeNull();
		});

		it('blocks import when topdown.png dimensions do not match track.json', () => {
			store.importTopdownImg.set(makeImage(999, 450));
			store.importTrack.set(VALID_TRACK_DEF);

			expect(store.canImport()).toBe(false);
			expect(store.importCompatibilityError()).toMatch(/do not match/);
		});

		it('is cleared by resetAll()', () => {
			store.importJsonError.set('json failure');
			store.importPngError.set('png failure');
			store.resetAll();
			expect(store.importJsonError()).toBeNull();
			expect(store.importPngError()).toBeNull();
		});

		it('is cleared by applyImport() after a successful import', () => {
			const img = makeImage(100, 100);
			const track = {
				schemaVersion: TRACK_SCHEMA_VERSION,
				id: 'test',
				name: 'Test Track',
				widthMeters: 20,
				heightMeters: 12,
				topdownPx: { w: 100, h: 100 },
				zones: [],
				centerline: [],
				import: VALID_IMPORT_META,
			} as Parameters<typeof store.importTrack.set>[0];

			store.importTopdownImg.set(img);
			store.importTrack.set(track);
			store.importJsonError.set('stale json error');
			store.importPngError.set('stale png error');

			store.applyImport();

			expect(store.importJsonError()).toBeNull();
			expect(store.importPngError()).toBeNull();
		});
	});

	describe('resetAll', () => {
		it('resets step to upload and clears all relevant signals', () => {
			const canvas = makeCanvas();
			store.step.set('export');
			store.quadError.set('warp err');
			store.importJsonError.set('json err');
			store.importPngError.set('png err');
			store.topDown.set(canvas);
			store.measureMode.set(true);

			store.resetAll();

			expect(store.step()).toBe('upload');
			expect(store.quadError()).toBeNull();
			expect(store.importJsonError()).toBeNull();
			expect(store.importPngError()).toBeNull();
			expect(store.topDown()).toBeNull();
			expect(store.measureMode()).toBe(false);
		});
	});

	describe('onImportTrackJsonFile', () => {
		function triggerImport(json: unknown) {
			const content = JSON.stringify(json);

			const originalFileReader = (globalThis as { FileReader?: unknown })
				.FileReader;
			const mockReader = {
				result: content,
				onload: null as (() => void) | null,
				readAsText() {
					(this.onload as (() => void) | null)?.();
				},
			};
			(globalThis as { FileReader?: unknown }).FileReader =
				function MockFileReader() {
					return mockReader;
				};

			const input = document.createElement('input');
			input.type = 'file';
			Object.defineProperty(input, 'files', {
				value: [
					new File([content], 'track.json', { type: 'application/json' }),
				],
				configurable: true,
			});
			const ev = { target: input } as unknown as Event;
			store.onImportTrackJsonFile(ev);

			(globalThis as { FileReader?: unknown }).FileReader = originalFileReader;
		}

		it('accepts a valid track.json', () => {
			triggerImport({
				schemaVersion: TRACK_SCHEMA_VERSION,
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 20,
				heightMeters: 12,
				name: 'Test',
				id: 'abc',
				zones: [],
				centerline: [],
				import: VALID_IMPORT_META,
			});
			expect(store.importTrack()?.widthMeters).toBe(20);
		});

		it('accepts legacy unversioned track.json with a warning', () => {
			triggerImport({
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 20,
				heightMeters: 12,
				name: 'Test',
				id: 'abc',
				zones: [],
				centerline: [],
				import: VALID_IMPORT_META,
			});

			expect(store.importTrack()?.schemaVersion).toBe(TRACK_SCHEMA_VERSION);
			expect(store.importWarnings().join(' ')).toMatch(/Legacy unversioned/i);
		});

		it('rejects track.json with zero widthMeters', () => {
			triggerImport({
				schemaVersion: TRACK_SCHEMA_VERSION,
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 0,
				heightMeters: 12,
				name: 'Test',
				id: 'abc',
				zones: [],
				centerline: [],
				import: VALID_IMPORT_META,
			});
			expect(store.importTrack()).toBeNull();
		});

		it('rejects track.json with negative heightMeters', () => {
			triggerImport({
				schemaVersion: TRACK_SCHEMA_VERSION,
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 20,
				heightMeters: -5,
				name: 'Test',
				id: 'abc',
				zones: [],
				centerline: [],
				import: VALID_IMPORT_META,
			});
			expect(store.importTrack()).toBeNull();
		});

		it('rejects track.json with null heightMeters', () => {
			triggerImport({
				schemaVersion: TRACK_SCHEMA_VERSION,
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 20,
				heightMeters: null,
				name: 'Test',
				id: 'abc',
				zones: [],
				centerline: [],
				import: VALID_IMPORT_META,
			});
			expect(store.importTrack()).toBeNull();
		});
	});
});
