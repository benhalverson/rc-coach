import {
	pxToNorm,
	normToPx,
	rectPolyPx,
	validateQuadTLTRBRBL,
	isQuadValid,
	type Pt,
} from './geometry';

// ---------------------------------------------------------------------------
// rectPolyPx
// ---------------------------------------------------------------------------
describe('rectPolyPx', () => {
	it('returns a 4-point axis-aligned rectangle from two corners', () => {
		const poly = rectPolyPx({ x: 10, y: 20 }, { x: 50, y: 60 });

		expect(poly).toHaveLength(4);
		// TL
		expect(poly[0]).toEqual({ x: 10, y: 20 });
		// TR
		expect(poly[1]).toEqual({ x: 50, y: 20 });
		// BR
		expect(poly[2]).toEqual({ x: 50, y: 60 });
		// BL
		expect(poly[3]).toEqual({ x: 10, y: 60 });
	});

	it('normalizes inverted corners correctly', () => {
		// b is top-left, a is bottom-right – result should still be correct
		const poly = rectPolyPx({ x: 50, y: 60 }, { x: 10, y: 20 });

		expect(poly[0]).toEqual({ x: 10, y: 20 });
		expect(poly[2]).toEqual({ x: 50, y: 60 });
	});

	it('returns a degenerate rectangle when both corners are the same point', () => {
		const poly = rectPolyPx({ x: 30, y: 30 }, { x: 30, y: 30 });

		expect(poly).toHaveLength(4);
		// All corners collapse to the same point
		for (const pt of poly) {
			expect(pt).toEqual({ x: 30, y: 30 });
		}
	});
});

// ---------------------------------------------------------------------------
// pxToNorm / normToPx
// ---------------------------------------------------------------------------
describe('pxToNorm', () => {
	it('normalizes a pixel point to [0..1] range', () => {
		expect(pxToNorm({ x: 100, y: 200 }, 400, 800)).toEqual([0.25, 0.25]);
	});

	it('returns [0, 0] for origin', () => {
		expect(pxToNorm({ x: 0, y: 0 }, 400, 800)).toEqual([0, 0]);
	});

	it('returns [1, 1] for the far corner', () => {
		expect(pxToNorm({ x: 400, y: 800 }, 400, 800)).toEqual([1, 1]);
	});
});

describe('normToPx', () => {
	it('converts normalized coords back to pixels', () => {
		expect(normToPx([0.25, 0.25], 400, 800)).toEqual({ x: 100, y: 200 });
	});

	it('returns origin for [0, 0]', () => {
		expect(normToPx([0, 0], 400, 800)).toEqual({ x: 0, y: 0 });
	});

	it('returns far corner for [1, 1]', () => {
		expect(normToPx([1, 1], 400, 800)).toEqual({ x: 400, y: 800 });
	});
});

describe('pxToNorm / normToPx round-trip', () => {
	it('round-trips from pixel to normalized and back', () => {
		const original: Pt = { x: 123, y: 456 };
		const norm = pxToNorm(original, 1920, 1080);
		const recovered = normToPx(norm, 1920, 1080);

		expect(recovered.x).toBeCloseTo(original.x, 10);
		expect(recovered.y).toBeCloseTo(original.y, 10);
	});
});

// ---------------------------------------------------------------------------
// validateQuadTLTRBRBL
// ---------------------------------------------------------------------------
describe('validateQuadTLTRBRBL', () => {
	// A clean convex quad well inside a 1000×1000 image
	const validQuad: Pt[] = [
		{ x: 100, y: 100 },
		{ x: 900, y: 100 },
		{ x: 900, y: 900 },
		{ x: 100, y: 900 },
	];

	it('accepts a valid convex quad', () => {
		expect(validateQuadTLTRBRBL(validQuad, 1000, 1000)).toEqual({ ok: true });
	});

	it('rejects when there are too few points', () => {
		const result = validateQuadTLTRBRBL(
			[{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 900 }],
			1000,
			1000,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/4 points/i);
	});

	it('rejects when there are too many points', () => {
		const result = validateQuadTLTRBRBL(
			[...validQuad, { x: 500, y: 500 }],
			1000,
			1000,
		);
		expect(result.ok).toBe(false);
	});

	it('rejects when a point is outside the image bounds', () => {
		const outOfBounds: Pt[] = [
			{ x: -10, y: 100 }, // negative x
			{ x: 900, y: 100 },
			{ x: 900, y: 900 },
			{ x: 100, y: 900 },
		];
		const result = validateQuadTLTRBRBL(outOfBounds, 1000, 1000);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/outside/i);
	});

	it('rejects when two points are too close together', () => {
		const tooClose: Pt[] = [
			{ x: 100, y: 100 },
			{ x: 110, y: 100 }, // only 10 px from first point (< default 20 px)
			{ x: 900, y: 900 },
			{ x: 100, y: 900 },
		];
		const result = validateQuadTLTRBRBL(tooClose, 1000, 1000);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/close/i);
	});

	it('rejects a self-intersecting (bow-tie) quad', () => {
		// TL, BR, TR, BL ordering creates edges that cross each other
		const bowTie: Pt[] = [
			{ x: 100, y: 100 },
			{ x: 900, y: 100 },
			{ x: 100, y: 900 },
			{ x: 900, y: 900 },
		];
		const result = validateQuadTLTRBRBL(bowTie, 1000, 1000);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/non-convex|bow-tie|self-intersect/i);
	});

	it('rejects a quad whose area is too small', () => {
		// A thin trapezoid: points are all > 20 px apart but area is only ~1750 px²
		const thin: Pt[] = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 70, y: 25 },
			{ x: 30, y: 25 },
		];
		const result = validateQuadTLTRBRBL(thin, 1000, 1000);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toMatch(/area|small|degenerate/i);
	});

	it('accepts custom minPointSeparationPx and minAreaPx2 thresholds', () => {
		// Same thin trapezoid passes when the area threshold is relaxed
		const thin: Pt[] = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 70, y: 25 },
			{ x: 30, y: 25 },
		];
		const result = validateQuadTLTRBRBL(thin, 1000, 1000, {
			minAreaPx2: 1000,
		});
		expect(result).toEqual({ ok: true });
	});
});

// ---------------------------------------------------------------------------
// isQuadValid (legacy helper)
// ---------------------------------------------------------------------------
describe('isQuadValid', () => {
	it('returns true for a valid convex quad', () => {
		const pts: Pt[] = [
			{ x: 100, y: 100 },
			{ x: 900, y: 100 },
			{ x: 900, y: 900 },
			{ x: 100, y: 900 },
		];
		expect(isQuadValid(pts, 1000, 1000)).toBe(true);
	});

	it('returns false when point count is not 4', () => {
		expect(isQuadValid([{ x: 0, y: 0 }], 1000, 1000)).toBe(false);
	});

	it('returns false when a point is outside the image bounds', () => {
		const pts: Pt[] = [
			{ x: -5, y: 100 },
			{ x: 900, y: 100 },
			{ x: 900, y: 900 },
			{ x: 100, y: 900 },
		];
		expect(isQuadValid(pts, 1000, 1000)).toBe(false);
	});

	it('returns false for a tiny quad (area < 5000)', () => {
		const pts: Pt[] = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
		];
		expect(isQuadValid(pts, 1000, 1000)).toBe(false);
	});
});
