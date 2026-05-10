import { parameterizeCenterline } from '../geometry/centerline-params';
import { arcLengthRate, frenetToWorld, worldToFrenet } from '../geometry/frenet';

// Five-point horizontal line: avoids heading wrap-around at interior points.
// Using 4 equal segments so that s=50 is safely in the middle with heading=0.
const STRAIGHT_LINE = [
	[0, 0],
	[25, 0],
	[50, 0],
	[75, 0],
	[100, 0],
] as [number, number][];

describe('worldToFrenet', () => {
	it('returns d=0 and headingError=0 for a point on the centerline', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const frenet = worldToFrenet(params, 50, 0, 0);

		expect(frenet.s).toBeCloseTo(50);
		expect(frenet.d).toBeCloseTo(0);
		expect(frenet.headingError).toBeCloseTo(0);
	});

	it('returns positive d for a point to the right of the centerline', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		// +y is perpendicular right for a heading-0 (east) centerline
		const frenet = worldToFrenet(params, 50, 10, 0);

		expect(frenet.d).toBeCloseTo(10);
	});

	it('returns negative d for a point to the left of the centerline', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const frenet = worldToFrenet(params, 50, -10, 0);

		expect(frenet.d).toBeCloseTo(-10);
	});

	it('returns correct headingError for a vehicle angled to the centerline', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const angle = Math.PI / 4; // 45°
		const frenet = worldToFrenet(params, 50, 0, angle);

		expect(frenet.headingError).toBeCloseTo(angle);
	});

	it('normalizes headingError to [-π, π]', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		// Large positive angle that exceeds π when subtracted from centerline heading 0
		const frenet = worldToFrenet(params, 50, 0, 4 * Math.PI);

		expect(frenet.headingError).toBeGreaterThanOrEqual(-Math.PI);
		expect(frenet.headingError).toBeLessThanOrEqual(Math.PI);
	});
});

describe('frenetToWorld', () => {
	it('returns start position for s=0, d=0, headingError=0', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const result = frenetToWorld(params, 0, 0, 0);

		expect(result.x).toBeCloseTo(0);
		expect(result.y).toBeCloseTo(0);
		expect(result.heading).toBeCloseTo(0);
	});

	it('reconstructs world position from frenet coordinates on centerline', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const result = frenetToWorld(params, 50, 0, 0);

		expect(result.x).toBeCloseTo(50);
		expect(result.y).toBeCloseTo(0);
	});

	it('offsets perpendicular to centerline for non-zero d', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		// Centerline heading is 0 (east), perpendicular is π/2 (north)
		const result = frenetToWorld(params, 50, 10, 0);

		expect(result.x).toBeCloseTo(50);
		// Perpendicular offset of 10 for a heading-0 segment goes in +y direction
		expect(result.y).toBeCloseTo(10);
	});

	it('round-trips worldToFrenet → frenetToWorld', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const worldX = 60;
		const worldY = 5;
		const worldHeading = 0.2;

		const frenet = worldToFrenet(params, worldX, worldY, worldHeading);
		const back = frenetToWorld(params, frenet.s, frenet.d, frenet.headingError);

		expect(back.x).toBeCloseTo(worldX, 3);
		expect(back.y).toBeCloseTo(worldY, 3);
		expect(back.heading).toBeCloseTo(worldHeading, 3);
	});
});

describe('arcLengthRate', () => {
	it('equals speed for a point on centerline with zero heading error', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const rate = arcLengthRate(params, 50, 0, 0, 1.0);

		// cos(0) = 1, denom = 1 + 0 * 0 = 1  →  rate = 1
		expect(rate).toBeCloseTo(1.0);
	});

	it('returns zero for zero speed', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const rate = arcLengthRate(params, 50, 0, 0, 0);

		expect(rate).toBeCloseTo(0);
	});

	it('reduces rate for 90° heading error', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const rate = arcLengthRate(params, 50, 0, Math.PI / 2, 1.0);

		// cos(π/2) ≈ 0
		expect(rate).toBeCloseTo(0, 4);
	});

	it('scales linearly with speed', () => {
		const params = parameterizeCenterline(STRAIGHT_LINE);
		const rate2 = arcLengthRate(params, 50, 0, 0, 2.0);
		const rate4 = arcLengthRate(params, 50, 0, 0, 4.0);

		expect(rate4).toBeCloseTo(rate2 * 2, 6);
	});
});
