import { TestBed } from '@angular/core/testing';
import { Opencv } from '../opencv';
import { TrackStore } from './track-store';

const VALID_QUAD = [
	{ x: 10, y: 10 },
	{ x: 90, y: 10 },
	{ x: 90, y: 90 },
	{ x: 10, y: 90 },
];

function makeMockImage(): HTMLImageElement {
	const img = document.createElement('img');
	Object.defineProperty(img, 'naturalWidth', { value: 100 });
	Object.defineProperty(img, 'naturalHeight', { value: 100 });
	return img;
}

describe('TrackStore', () => {
	let store: TrackStore;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		store = TestBed.inject(TrackStore);
	});

	it('should be created', () => {
		expect(store).toBeTruthy();
	});

	it('warpError starts as null', () => {
		expect(store.warpError()).toBeNull();
	});

	describe('onQuad', () => {
		it('sets warpError and stays on quad step when cv.ready() rejects', async () => {
			const cv = TestBed.inject(Opencv);
			vi.spyOn(cv, 'ready').mockRejectedValue(
				new Error('Failed to load /assets/opencv/opencv.js'),
			);

			const img = makeMockImage();
			store.srcImage.set(img);
			store.step.set('quad');

			await store.onQuad(VALID_QUAD);

			expect(store.warpError()).toContain('OpenCV failed to load');
			expect(store.step()).toBe('quad');
		});

		it('sets warpError and stays on quad step when warpPerspective throws', async () => {
			const cv = TestBed.inject(Opencv);
			vi.spyOn(cv, 'ready').mockResolvedValue(undefined);
			vi.spyOn(cv, 'warpPerspective').mockImplementation(() => {
				throw new Error('cv internal error');
			});

			const img = makeMockImage();
			store.srcImage.set(img);
			store.step.set('quad');

			await store.onQuad(VALID_QUAD);

			expect(store.warpError()).toContain('Perspective warp failed');
			expect(store.step()).toBe('quad');
		});

		it('clears warpError on successful warp', async () => {
			const cv = TestBed.inject(Opencv);
			vi.spyOn(cv, 'ready').mockResolvedValue(undefined);

			// Build a canvas with non-black pixels so it passes the blank check
			const canvas = document.createElement('canvas');
			canvas.width = 4;
			canvas.height = 4;

			vi.spyOn(cv, 'warpPerspective').mockReturnValue(canvas);

			// Override isMostlyBlankCanvas via the canvas context – canvas in jsdom
			// getContext returns null, which makes isMostlyBlankCanvas return true.
			// We need to supply a real context stub so the warp is accepted.
			// The sampler canvas is 32×32 = 1024 pixels; fill all with opaque red
			// so the non-black ratio is 100% >> the 1% minimum threshold.
			const pixelCount = 32 * 32;
			const imgData = new Uint8ClampedArray(pixelCount * 4);
			for (let i = 0; i < imgData.length; i += 4) {
				imgData[i] = 200; // R
				imgData[i + 1] = 0; // G
				imgData[i + 2] = 0; // B
				imgData[i + 3] = 255; // A
			}
			const fakeCtx = {
				drawImage: vi.fn(),
				getImageData: vi.fn().mockReturnValue({ data: imgData }),
			} as unknown as CanvasRenderingContext2D;
			const origCreateElement = document.createElement.bind(document);
			vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
				if (tag === 'canvas') {
					const c = { width: 32, height: 32, getContext: () => fakeCtx } as unknown as HTMLCanvasElement;
					return c;
				}
				return origCreateElement(tag);
			});

			store.warpError.set('previous error');
			const img = makeMockImage();
			store.srcImage.set(img);
			store.step.set('quad');

			await store.onQuad(VALID_QUAD);

			expect(store.warpError()).toBeNull();
		});
	});

	describe('resetAll', () => {
		it('clears warpError', () => {
			store.warpError.set('some error');
			store.resetAll();
			expect(store.warpError()).toBeNull();
		});
	});
});
