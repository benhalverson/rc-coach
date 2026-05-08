import type { Vec2 } from '../track-types';
import {
	nearestArcLength,
	parameterizeCenterline,
	poseAtArcLength,
} from './centerline-params';

describe('parameterizeCenterline', () => {
	it('throws when fewer than 2 points are given', () => {
		expect(() => parameterizeCenterline([[0, 0]])).toThrow();
		expect(() => parameterizeCenterline([])).toThrow();
	});

	it('returns zero arc-length at the first point', () => {
		const pts: Vec2[] = [
			[0, 0],
			[1, 0],
		];
		const params = parameterizeCenterline(pts);
		expect(params.arcLengths[0]).toBe(0);
	});

	it('computes totalLength correctly for a horizontal line', () => {
		const pts: Vec2[] = [
			[0, 0],
			[0.5, 0],
			[1, 0],
		];
		const params = parameterizeCenterline(pts);
		expect(params.totalLength).toBeCloseTo(1, 6);
	});

	it('computes totalLength correctly for a diagonal line', () => {
		const pts: Vec2[] = [
			[0, 0],
			[1, 1],
		];
		const params = parameterizeCenterline(pts);
		expect(params.totalLength).toBeCloseTo(Math.SQRT2, 6);
	});

	it('returns the same number of headings and curvatures as points', () => {
		const pts: Vec2[] = [
			[0, 0],
			[0.5, 0],
			[1, 0],
		];
		const params = parameterizeCenterline(pts);
		expect(params.headings.length).toBe(pts.length);
		expect(params.curvatures.length).toBe(pts.length);
	});

	it('has heading 0 for a horizontal right-going line', () => {
		const pts: Vec2[] = [
			[0, 0],
			[1, 0],
		];
		const params = parameterizeCenterline(pts);
		expect(params.headings[0]).toBeCloseTo(0, 6);
	});
});

describe('poseAtArcLength', () => {
	const straightLine: Vec2[] = [
		[0, 0],
		[1, 0],
	];

	it('returns start point at s=0', () => {
		const params = parameterizeCenterline(straightLine);
		const { pos } = poseAtArcLength(params, 0);
		expect(pos[0]).toBeCloseTo(0, 5);
		expect(pos[1]).toBeCloseTo(0, 5);
	});

	it('returns end point at s just before totalLength', () => {
		const params = parameterizeCenterline(straightLine);
		// s=totalLength wraps to 0 due to modular arc-length; use a value just
		// before the end to confirm near-endpoint interpolation.
		const { pos } = poseAtArcLength(params, params.totalLength - 1e-9);
		expect(pos[0]).toBeCloseTo(1, 3);
		expect(pos[1]).toBeCloseTo(0, 3);
	});

	it('returns midpoint at s=totalLength/2', () => {
		const params = parameterizeCenterline(straightLine);
		const { pos } = poseAtArcLength(params, params.totalLength / 2);
		expect(pos[0]).toBeCloseTo(0.5, 5);
		expect(pos[1]).toBeCloseTo(0, 5);
	});

	it('wraps negative arc-length', () => {
		const params = parameterizeCenterline(straightLine);
		// Negative s should wrap to totalLength + s (mod totalLength).
		const { pos } = poseAtArcLength(params, -params.totalLength);
		expect(pos[0]).toBeCloseTo(0, 5);
	});
});

describe('nearestArcLength', () => {
	it('finds s=0 for a point at the start', () => {
		const params = parameterizeCenterline([
			[0, 0],
			[1, 0],
		]);
		const { s, distance } = nearestArcLength(params, [0, 0]);
		expect(s).toBeCloseTo(0, 5);
		expect(distance).toBeCloseTo(0, 5);
	});

	it('finds the nearest point on a perpendicular projection', () => {
		const params = parameterizeCenterline([
			[0, 0],
			[1, 0],
		]);
		// Point above mid-line at x=0.5, y=0.1
		const { s, distance } = nearestArcLength(params, [0.5, 0.1]);
		expect(s).toBeCloseTo(0.5, 5);
		expect(distance).toBeCloseTo(0.1, 5);
	});
});
