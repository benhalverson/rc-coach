import type { Vec2, Zone } from '../track-types';

export type ZoneHit = { zone: Zone; distance: number };

export type ZoneQueryResult = {
	containing: Zone[];
	nearest: ZoneHit | null;
};

export type ZoneQueryOptions = {
	/**
	 * Optional maximum distance (normalized units) for nearest match.
	 * If the closest zone is farther than this, `nearest` is null.
	 */
	maxDistance?: number;
};

/**
 * Return zones containing a normalized point plus the nearest zone when none contain it.
 * @param pt normalized point [x, y]
 * @param zones zones with normalized polygons
 * @param options optional distance filter for nearest
 */
export function queryZonesAtPoint(
	pt: Vec2,
	zones: Zone[],
	options: ZoneQueryOptions = {},
): ZoneQueryResult {
	const containing: Zone[] = [];
	let nearest: ZoneHit | null = null;

	for (const zone of zones) {
		if (zone.poly.length < 3) continue;
		const inside = pointInPolygon(pt, zone.poly);
		if (inside) containing.push(zone);

		const distance = inside ? 0 : polygonDistance(pt, zone.poly);
		if (!nearest || distance < nearest.distance) {
			nearest = { zone, distance };
		}
	}

	if (
		options.maxDistance != null &&
		nearest &&
		nearest.distance > options.maxDistance
	) {
		nearest = null;
	}

	return { containing, nearest };
}

function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		const intersects =
			yi > pt[1] !== yj > pt[1] &&
			pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
		if (intersects) inside = !inside;
	}
	return inside;
}

function polygonDistance(pt: Vec2, poly: Vec2[]): number {
	let minSq = Number.POSITIVE_INFINITY;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		const sq = segmentDistanceSq(pt, a, b);
		if (sq < minSq) minSq = sq;
	}
	return Math.sqrt(minSq);
}

function segmentDistanceSq(pt: Vec2, a: Vec2, b: Vec2): number {
	const ab = [b[0] - a[0], b[1] - a[1]] as Vec2;
	const ap = [pt[0] - a[0], pt[1] - a[1]] as Vec2;
	const abLenSq = ab[0] * ab[0] + ab[1] * ab[1];
	if (abLenSq === 0) return ap[0] * ap[0] + ap[1] * ap[1];

	const t = clamp((ap[0] * ab[0] + ap[1] * ab[1]) / abLenSq, 0, 1);
	const closest = [a[0] + ab[0] * t, a[1] + ab[1] * t] as Vec2;
	const dx = pt[0] - closest[0];
	const dy = pt[1] - closest[1];
	return dx * dx + dy * dy;
}

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}
