import type { Vec2, Zone } from '../track-types';
import type { CenterlineParams } from './centerline-params';

/**
 * Track lateral limits as a function of arc-length.
 * - left(s): signed lateral distance to left boundary (normalized or meters).
 * - right(s): signed lateral distance to right boundary.
 * Convention: +d is right, -d is left; limits are symmetric or asymmetric.
 */
export interface TrackLimits {
	/**
	 * Left boundary: d_left(s) ≤ d ≤ d_right(s).
	 * Organized as array indexed by arc-length segment.
	 */
	leftBounds: number[];
	/**
	 * Right boundary.
	 */
	rightBounds: number[];
	/** Number of arc-length samples. */
	samples: number;
	/** Total arc-length for reference. */
	totalLength: number;
}

/**
 * Extract track lateral limits from zone polygons.
 * For each arc-length sample, compute the nearest distance to zone boundaries.
 * Returns symmetric or zone-derived lateral bounds.
 *
 * @param params parameterized centerline.
 * @param zones track zones (jump, wallride, etc.).
 * @param numSamples number of arc-length samples for discretization.
 * @returns track limits { leftBounds, rightBounds, ... }.
 */
export function extractTrackLimits(
	params: CenterlineParams,
	zones: Zone[],
	numSamples: number = 100,
): TrackLimits {
	const leftBounds: number[] = [];
	const rightBounds: number[] = [];
	const ds = params.totalLength / Math.max(1, numSamples - 1);

	for (let i = 0; i < numSamples; i++) {
		const s = i * ds;
		const { pos } = require('./centerline-params').poseAtArcLength(params, s);

		// Find minimum distance to zone edges.
		let minDistLeft = Infinity;
		let minDistRight = Infinity;

		for (const zone of zones) {
			const polyDist = pointToPolygonDistance(pos, zone.poly);
			// Heuristic: zones are obstacles; use distance as lateral bound.
			// Refine with winding number or point-in-polygon for directional bounds.
			if (polyDist < minDistLeft) minDistLeft = polyDist;
			if (polyDist < minDistRight) minDistRight = polyDist;
		}

		// Default fallback: ±0.5 normalized units (or tunable).
		const defaultLateral = 0.5;
		leftBounds.push(minDistLeft < Infinity ? -minDistLeft : -defaultLateral);
		rightBounds.push(minDistRight < Infinity ? minDistRight : defaultLateral);
	}

	return {
		leftBounds,
		rightBounds,
		samples: numSamples,
		totalLength: params.totalLength,
	};
}

/**
 * Compute signed distance from a point to a polygon edge.
 * Positive = outside, negative = inside (via winding number).
 * Simple approximation: min distance to any edge, signed by interior test.
 *
 * @param pt query point [x, y].
 * @param poly polygon vertices [x, y][].
 * @returns signed distance.
 */
function pointToPolygonDistance(pt: Vec2, poly: Vec2[]): number {
	if (poly.length < 3) return Infinity;

	let minDist = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		const dist = pointToSegmentDistance(pt, a, b);
		if (dist < minDist) minDist = dist;
	}

	// Winding number or ray casting to determine inside/outside.
	const inside = pointInPolygon(pt, poly);
	return inside ? -minDist : minDist;
}

/**
 * Minimum distance from point to line segment.
 */
function pointToSegmentDistance(pt: Vec2, a: Vec2, b: Vec2): number {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const lenSq = dx * dx + dy * dy;
	if (lenSq < 1e-10) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);

	const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq));
	const closest = [a[0] + t * dx, a[1] + t * dy];
	return Math.hypot(pt[0] - closest[0], pt[1] - closest[1]);
}

/**
 * Point-in-polygon test (ray casting).
 */
function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i][0];
		const yi = poly[i][1];
		const xj = poly[j][0];
		const yj = poly[j][1];
		const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}
