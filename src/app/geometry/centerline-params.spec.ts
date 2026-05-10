import { nearestArcLength, parameterizeCenterline, poseAtArcLength } from './centerline-params';

// Straight horizontal line: (0,0) → (100,0)
const STRAIGHT_LINE = [
	[0, 0],
	[100, 0],
] as [number, number][];

// L-shaped polyline: (0,0) → (100,0) → (100,100)
const L_SHAPE = [
	[0, 0],
	[100, 0],
	[100, 100],
] as [number, number][];

describe('parameterizeCenterline', () => {
	it('throws for empty array', () => {
		expect(() => parameterizeCenterline([])).toThrow('Need at least 2 points');
	});

	it('throws for single-point array', () => {
		expect(() => parameterizeCenterline([[0, 0]])).toThrow(
			'Need at least 2 points',
		);
	});

	it('returns correct structure for two-point line', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);

		expect(params.points).toEqual(STRAIGHT_LINE);
		expect(params.arcLengths).toHaveLength(2);
		expect(params.arcLengths[0]).toBe(0);
		expect(params.arcLengths[1]).toBeCloseTo(100);
		expect(params.totalLength).toBeCloseTo(100);
		expect(params.headings).toHaveLength(2);
		expect(params.curvatures).toHaveLength(2);
	});

	it('computes zero heading for a horizontal line', () => {
		const { headings } = parameterizeCenterline(STRAIGHT_LINE);
		// atan2(0, 100) = 0
		expect(headings[0]).toBeCloseTo(0);
	});

	it('computes correct arc-lengths for L-shaped polyline', () => {
		const { arcLengths, totalLength } = parameterizeCenterline(L_SHAPE);

		expect(arcLengths[0]).toBeCloseTo(0);
		expect(arcLengths[1]).toBeCloseTo(100);
		expect(arcLengths[2]).toBeCloseTo(200);
		expect(totalLength).toBeCloseTo(200);
	});

	it('computes non-zero curvature at the corner of an L-shape', () => {
		const { curvatures } = parameterizeCenterline(L_SHAPE);
		// The middle point is a 90° turn so curvature should be non-zero
		expect(curvatures[1]).not.toBe(0);
	});

	it('computes zero curvature for a straight line', () => {
		const { curvatures } = parameterizeCenterline(STRAIGHT_LINE);
		// Both segments share the same heading → curvature ≈ 0
		expect(curvatures[0]).toBeCloseTo(0);
		expect(curvatures[1]).toBeCloseTo(0);
	});
});

describe('poseAtArcLength', () => {
	it('returns the first point at s=0', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const { pos, heading } = poseAtArcLength(params, 0);

		expect(pos[0]).toBeCloseTo(0);
		expect(pos[1]).toBeCloseTo(0);
		expect(heading).toBeCloseTo(0);
	});

	it('interpolates the midpoint correctly', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const { pos } = poseAtArcLength(params, 50);

		expect(pos[0]).toBeCloseTo(50);
		expect(pos[1]).toBeCloseTo(0);
	});

	it('wraps negative s to valid range', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const { pos } = poseAtArcLength(params, -50);

		// -50 % 100 = -50 → wrapped to 50
		expect(pos[0]).toBeCloseTo(50);
		expect(pos[1]).toBeCloseTo(0);
	});

	it('wraps s beyond totalLength', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		// 150 % 100 = 50
		const { pos } = poseAtArcLength(params, 150);

		expect(pos[0]).toBeCloseTo(50);
		expect(pos[1]).toBeCloseTo(0);
	});

	it('returns heading at a known corner of L-shape', () => {
		const params = parameterizeCenterline(L_SHAPE);
		// At s=100 we are at the corner point (100,0)
		const { pos } = poseAtArcLength(params, 100);

		expect(pos[0]).toBeCloseTo(100);
		expect(pos[1]).toBeCloseTo(0);
	});
});

describe('nearestArcLength', () => {
	it('returns s=0 and d=0 for a point on the start', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const { s, d, distance } = nearestArcLength(params, [0, 0]);

		expect(s).toBeCloseTo(0);
		expect(d).toBeCloseTo(0);
		expect(distance).toBeCloseTo(0);
	});

	it('returns midpoint arc-length for a point on the line', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const { s, d, distance } = nearestArcLength(params, [50, 0]);

		expect(s).toBeCloseTo(50);
		expect(d).toBeCloseTo(0);
		expect(distance).toBeCloseTo(0);
	});

	it('returns positive lateral error for a point above a horizontal line', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		// Point at (50, 10) – 10 units above the line
		const { s, d, distance } = nearestArcLength(params, [50, 10]);

		expect(s).toBeCloseTo(50);
		expect(d).toBeCloseTo(10);
		expect(distance).toBeCloseTo(10);
	});

	it('returns negative lateral error for a point below a horizontal line', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		// Point at (50, -10) – 10 units below the line
		const { d } = nearestArcLength(params, [50, -10]);

		expect(d).toBeCloseTo(-10);
	});

	it('clamps projection to segment endpoints', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		// Point far before the start
		const { s } = nearestArcLength(params, [-999, 0]);

		expect(s).toBeCloseTo(0);
	});
});
