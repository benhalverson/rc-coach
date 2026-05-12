import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../track-types';
import { deriveCenterline } from './derived-centerline';

describe('deriveCenterline', () => {
	it('returns null for short lines', () => {
		expect(deriveCenterline([])).toBeNull();
		expect(deriveCenterline([[0.5, 0.5]])).toBeNull();
	});

	it('preserves raw points and samples a two-point line', () => {
		const raw: Vec2[] = [
			[0, 0],
			[1, 0],
		];
		const derived = deriveCenterline(raw, { samplesPerSegment: 4 });

		expect(derived).not.toBeNull();
		expect(derived?.rawPoints).toEqual(raw);
		expect(derived?.sampledPoints).toEqual([
			[0, 0],
			[0.25, 0],
			[0.5, 0],
			[0.75, 0],
			[1, 0],
		]);
		expect(derived?.isSmoothed).toBe(false);
		expect(derived?.totalLength).toBeCloseTo(1);
	});

	it('samples a smoothed line for three or more points', () => {
		const derived = deriveCenterline(
			[
				[0, 0.5],
				[0.5, 0.1],
				[1, 0.5],
			],
			{ samplesPerSegment: 4 },
		);

		expect(derived).not.toBeNull();
		expect(derived?.isSmoothed).toBe(true);
		expect(derived?.sampledPoints.length).toBeGreaterThan(3);
		expect(derived?.sampledPoints.at(0)).toEqual([0, 0.5]);
		expect(derived?.sampledPoints.at(-1)).toEqual([1, 0.5]);
	});

	it('keeps sampled points normalized', () => {
		const derived = deriveCenterline(
			[
				[0, 0],
				[0.1, 1],
				[1, 0],
			],
			{ samplesPerSegment: 16 },
		);

		expect(
			derived?.sampledPoints.every(
				([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1,
			),
		).toBe(true);
	});
});
