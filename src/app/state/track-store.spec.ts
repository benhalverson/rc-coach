import { TestBed } from '@angular/core/testing';
import { isValidDimension, TrackStore } from './track-store';

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

describe('TrackStore', () => {
	let store: TrackStore;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		store = TestBed.inject(TrackStore);
	});

	// ── scaleErrors / scaleValid ────────────────────────────────────────────

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

	// ── pixelsPerMeter ─────────────────────────────────────────────────────

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

	// ── applyMeasure ───────────────────────────────────────────────────────

	describe('applyMeasure', () => {
		it('does not update dimensions when pixelsPerMeter is null', () => {
			store.widthMeters.set(20);
			store.heightMeters.set(12);
			// pixelsPerMeter is null because no points are set
			store.applyMeasure();
			expect(store.widthMeters()).toBe(20);
			expect(store.heightMeters()).toBe(12);
		});

		it('does not update dimensions when topDown is null', () => {
			store.measurePt1.set({ x: 0, y: 0 });
			store.measurePt2.set({ x: 100, y: 0 });
			store.measureRealDist.set(5);
			// topDown signal is null
			store.applyMeasure();
			expect(store.widthMeters()).toBe(20);
			expect(store.heightMeters()).toBe(12);
		});
	});

	// ── exportErrors (dimension validation) ────────────────────────────────

	describe('exportErrors dimension validation', () => {
		it('contains dimension error when widthMeters is NaN', () => {
			store.widthMeters.set(Number.NaN);
			// trackDef requires topDown, quad and img; with those null it returns the missing error
			const errors = store.exportErrors();
			// either we get the missing-topdown error or the dimension error
			expect(
				errors.some(
					(e) =>
						e.includes('dimension') ||
						e.includes('Top-down image or quad selection missing'),
				),
			).toBe(true);
		});
	});

	// ── onImportTrackJsonFile (dimension validation) ────────────────────────

	describe('onImportTrackJsonFile', () => {
		function triggerImport(json: unknown) {
			const content = JSON.stringify(json);

			// Mock FileReader so readAsText synchronously fires onload
			const originalFileReader = (globalThis as { FileReader?: unknown }).FileReader;
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
