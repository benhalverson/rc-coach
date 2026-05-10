import type { Zone } from '../track-types';
import { queryZonesAtPoint } from './zone-query';

describe('queryZonesAtPoint', () => {
	const jumpZone: Zone = {
		id: 'jump',
		type: 'jump',
		poly: [
			[0.1, 0.1],
			[0.4, 0.1],
			[0.4, 0.4],
			[0.1, 0.4],
		],
	};

	const wallrideZone: Zone = {
		id: 'wall',
		type: 'wallride',
		poly: [
			[0.6, 0.0],
			[0.7, 0.0],
			[0.7, 0.6],
			[0.6, 0.6],
		],
	};

	it('returns containing zones when point is inside', () => {
		const result = queryZonesAtPoint([0.2, 0.2], [jumpZone, wallrideZone]);

		expect(result.containing).toEqual([jumpZone]);
		expect(result.nearest?.zone).toBe(jumpZone);
		expect(result.nearest?.distance).toBe(0);
	});

	it('returns nearest zone when outside all zones', () => {
		const result = queryZonesAtPoint([0.8, 0.3], [jumpZone, wallrideZone]);

		expect(result.containing.length).toBe(0);
		expect(result.nearest?.zone).toBe(wallrideZone);
		expect(result.nearest?.distance).toBeCloseTo(0.1, 5);
	});

	it('honors maxDistance for nearest match', () => {
		const result = queryZonesAtPoint([0.95, 0.95], [jumpZone], {
			maxDistance: 0.1,
		});

		expect(result.containing.length).toBe(0);
		expect(result.nearest).toBeNull();
	});

	it('returns null nearest when zone list is empty', () => {
		const result = queryZonesAtPoint([0.5, 0.5], []);

		expect(result.containing.length).toBe(0);
		expect(result.nearest).toBeNull();
	});

	it('skips zones with fewer than 3 points (invalid polygon)', () => {
		const tooFewPoints: Zone = {
			id: 'bad',
			type: 'jump',
			poly: [
				[0.5, 0.5],
				[0.6, 0.5],
			],
		};

		const result = queryZonesAtPoint([0.55, 0.5], [tooFewPoints]);

		expect(result.containing.length).toBe(0);
		expect(result.nearest).toBeNull();
	});

	it('correctly handles a valid triangle zone (minimum 3 points)', () => {
		const triangleZone: Zone = {
			id: 'tri',
			type: 'jump',
			poly: [
				[0.5, 0.1],
				[0.9, 0.9],
				[0.1, 0.9],
			],
		};

		// Centroid is inside the triangle
		const inside = queryZonesAtPoint([0.5, 0.6], [triangleZone]);
		expect(inside.containing).toEqual([triangleZone]);

		// Point outside the triangle
		const outside = queryZonesAtPoint([0.05, 0.05], [triangleZone]);
		expect(outside.containing.length).toBe(0);
		expect(outside.nearest?.zone).toBe(triangleZone);
	});

	it('returns multiple containing zones when point is in overlapping zones', () => {
		const overlapZone: Zone = {
			id: 'overlap',
			type: 'wallride',
			poly: [
				[0.0, 0.0],
				[0.5, 0.0],
				[0.5, 0.5],
				[0.0, 0.5],
			],
		};

		// [0.2, 0.2] is inside both jumpZone and overlapZone
		const result = queryZonesAtPoint([0.2, 0.2], [jumpZone, overlapZone]);

		expect(result.containing.length).toBe(2);
		expect(result.containing).toContain(jumpZone);
		expect(result.containing).toContain(overlapZone);
		expect(result.nearest?.distance).toBe(0);
	});

	it('honors maxDistance when nearest zone is within threshold', () => {
		// Point is 0.05 away from wallrideZone right edge (x=0.7)
		const result = queryZonesAtPoint([0.75, 0.3], [wallrideZone], {
			maxDistance: 0.1,
		});

		expect(result.containing.length).toBe(0);
		expect(result.nearest?.zone).toBe(wallrideZone);
		expect(result.nearest?.distance).toBeCloseTo(0.05, 5);
	});

	it('handles a non-convex (L-shaped) polygon correctly', () => {
		const lShapeZone: Zone = {
			id: 'lshape',
			type: 'jump',
			poly: [
				[0.0, 0.0],
				[0.6, 0.0],
				[0.6, 0.3],
				[0.3, 0.3],
				[0.3, 0.6],
				[0.0, 0.6],
			],
		};

		// Point in the vertical arm of the L
		const inVertArm = queryZonesAtPoint([0.1, 0.5], [lShapeZone]);
		expect(inVertArm.containing).toEqual([lShapeZone]);

		// Point in the notch cutout (outside the L)
		const inNotch = queryZonesAtPoint([0.5, 0.5], [lShapeZone]);
		expect(inNotch.containing.length).toBe(0);
	});
});
