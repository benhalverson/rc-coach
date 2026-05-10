import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Opencv } from '../opencv';
import { TrackStore } from './track-store';

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

	it('clears quadError and advances to scale step for a valid quad', async () => {
		// Seed an error first
		const bad = [{ x: 100, y: 100 }, { x: 105, y: 100 }, { x: 1500, y: 800 }, { x: 100, y: 800 }];
		await TestBed.runInInjectionContext(() => store.onQuad(bad));
		expect(store.quadError()).toBeTruthy();

		await TestBed.runInInjectionContext(() => store.onQuad(validQuad));
		expect(store.quadError()).toBeNull();
		expect(store.step()).toBe('scale');
	});

	it('calls OpenCV warpPerspective for a valid quad', async () => {
		await TestBed.runInInjectionContext(() => store.onQuad(validQuad));
		expect(warpSpy).toHaveBeenCalledOnce();
	});

	it('resetAll clears quadError', async () => {
		const bad = [{ x: 100, y: 100 }, { x: 105, y: 100 }, { x: 1500, y: 800 }, { x: 100, y: 800 }];
		await TestBed.runInInjectionContext(() => store.onQuad(bad));
		store.resetAll();
		expect(store.quadError()).toBeNull();
	});
	it('sets warpError and stays on quad step when cv.ready() rejects', async () => {
		readySpy.mockRejectedValue(new Error('Failed to load /assets/opencv/opencv.js'));
		await TestBed.runInInjectionContext(() => store.onQuad(validQuad));
		expect(store.warpError()).toContain('OpenCV failed to load');
		expect(store.step()).toBe('quad');
	});

	it('sets warpError and stays on quad step when warpPerspective throws', async () => {
		warpSpy.mockImplementation(() => {
			throw new Error('cv internal error');
		});
		await TestBed.runInInjectionContext(() => store.onQuad(validQuad));
		expect(store.warpError()).toContain('Perspective warp failed');
		expect(store.step()).toBe('quad');
	});

	it('resetAll clears warpError', async () => {
		store.warpError.set('some error');
		store.resetAll();
		expect(store.warpError()).toBeNull();
	});
});
