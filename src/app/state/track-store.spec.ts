import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Opencv } from '../opencv';
import { isValidDimension, TrackStore } from './track-store';

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

	// A valid TL/TR/BR/BL quad well inside a 1600×900 image
	const validQuad = [
		{ x: 100, y: 100 },
		{ x: 1500, y: 100 },
		{ x: 1500, y: 800 },
		{ x: 100, y: 800 },
	];

	beforeEach(() => {
		warpSpy = vi.fn().mockReturnValue(makeCanvas());

		TestBed.configureTestingModule({
			providers: [
				TrackStore,
				{
					provide: Opencv,
					useValue: {
						ready: vi.fn().mockResolvedValue(undefined),
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

	it('quadError starts as null', () => {
		expect(store.quadError()).toBeNull();
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
			expect(store.scaleErrors()).toContain('Width must be a positive finite number.');
		});

		it('reports an error when width is negative', () => {
			store.widthMeters.set(-5);
			expect(store.scaleErrors()).toContain('Width must be a positive finite number.');
		});

		it('reports an error when width is NaN', () => {
			store.widthMeters.set(Number.NaN);
			expect(store.scaleErrors()).toContain('Width must be a positive finite number.');
		});

		it('reports an error when width is Infinity', () => {
			store.widthMeters.set(Number.POSITIVE_INFINITY);
			expect(store.scaleErrors()).toContain('Width must be a positive finite number.');
		});

		it('reports an error when height is zero', () => {
			store.heightMeters.set(0);
			expect(store.scaleErrors()).toContain('Height must be a positive finite number.');
		});

		it('reports an error when height is negative', () => {
			store.heightMeters.set(-3);
			expect(store.scaleErrors()).toContain('Height must be a positive finite number.');
		});

		it('reports an error when height is NaN', () => {
			store.heightMeters.set(Number.NaN);
			expect(store.scaleErrors()).toContain('Height must be a positive finite number.');
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

			expect(store.exportErrors()).toContain('Track dimensions must be greater than 0.');
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

	describe('importError', () => {
		it('initialises as null', () => {
			expect(store.importError()).toBeNull();
		});

		it('is cleared by resetAll()', () => {
			store.importError.set('import failure');
			store.resetAll();
			expect(store.importError()).toBeNull();
		});

		it('is cleared by applyImport() after a successful import', () => {
			const img = new Image();
			const track = {
				id: 'test',
				name: 'Test Track',
				widthMeters: 20,
				heightMeters: 12,
				topdownPx: { w: 100, h: 100 },
				zones: [],
				centerline: [],
				import: { srcImageName: 'test.png', srcQuadPx: [] },
			} as Parameters<typeof store.importTrack.set>[0];

			store.importTopdownImg.set(img);
			store.importTrack.set(track);
			store.importError.set('stale error');

			store.applyImport();

			expect(store.importError()).toBeNull();
		});
	});

	describe('resetAll', () => {
		it('resets step to upload and clears all relevant signals', () => {
			const canvas = makeCanvas();
			store.step.set('export');
			store.quadError.set('warp err');
			store.importError.set('import err');
			store.topDown.set(canvas);
			store.measureMode.set(true);

			store.resetAll();

			expect(store.step()).toBe('upload');
			expect(store.quadError()).toBeNull();
			expect(store.importError()).toBeNull();
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
			(globalThis as { FileReader?: unknown }).FileReader = function () {
				return mockReader;
			};

			const input = document.createElement('input');
			input.type = 'file';
			Object.defineProperty(input, 'files', {
				value: [new File([content], 'track.json', { type: 'application/json' })],
				configurable: true,
			});
			const ev = { target: input } as unknown as Event;
			store.onImportTrackJsonFile(ev);

			(globalThis as { FileReader?: unknown }).FileReader = originalFileReader;
		}

		it('accepts a valid track.json', () => {
			triggerImport({
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 20,
				heightMeters: 12,
				name: 'Test',
				id: 'abc',
				zones: [],
				import: { srcImageName: 'x.png', srcQuadPx: [] },
			});
			expect(store.importTrack()?.widthMeters).toBe(20);
		});

		it('rejects track.json with zero widthMeters', () => {
			triggerImport({
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 0,
				heightMeters: 12,
				name: 'Test',
				id: 'abc',
				zones: [],
				import: { srcImageName: 'x.png', srcQuadPx: [] },
			});
			expect(store.importTrack()).toBeNull();
		});

		it('rejects track.json with negative heightMeters', () => {
			triggerImport({
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 20,
				heightMeters: -5,
				name: 'Test',
				id: 'abc',
				zones: [],
				import: { srcImageName: 'x.png', srcQuadPx: [] },
			});
			expect(store.importTrack()).toBeNull();
		});

		it('rejects track.json with null heightMeters', () => {
			triggerImport({
				topdownPx: { w: 1600, h: 900 },
				widthMeters: 20,
				heightMeters: null,
				name: 'Test',
				id: 'abc',
				zones: [],
				import: { srcImageName: 'x.png', srcQuadPx: [] },
			});
			expect(store.importTrack()).toBeNull();
		});
	});
});
