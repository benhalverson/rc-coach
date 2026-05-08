import { normToPx, pxToNorm } from './geometry';

describe('pxToNorm', () => {
	it('converts pixel point to normalized coords', () => {
		const norm = pxToNorm({ x: 400, y: 300 }, 800, 600);
		expect(norm[0]).toBeCloseTo(0.5, 6);
		expect(norm[1]).toBeCloseTo(0.5, 6);
	});

	it('clamps to origin at (0,0)', () => {
		const norm = pxToNorm({ x: 0, y: 0 }, 800, 600);
		expect(norm[0]).toBe(0);
		expect(norm[1]).toBe(0);
	});

	it('returns [1,1] at bottom-right corner', () => {
		const norm = pxToNorm({ x: 800, y: 600 }, 800, 600);
		expect(norm[0]).toBe(1);
		expect(norm[1]).toBe(1);
	});
});

describe('normToPx', () => {
	it('converts normalized point back to pixel coords', () => {
		const px = normToPx([0.5, 0.5], 800, 600);
		expect(px.x).toBeCloseTo(400, 6);
		expect(px.y).toBeCloseTo(300, 6);
	});

	it('round-trips through pxToNorm and back', () => {
		const original = { x: 320, y: 240 };
		const norm = pxToNorm(original, 640, 480);
		const back = normToPx(norm, 640, 480);
		expect(back.x).toBeCloseTo(original.x, 6);
		expect(back.y).toBeCloseTo(original.y, 6);
	});
});
