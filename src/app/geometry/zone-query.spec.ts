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
});
