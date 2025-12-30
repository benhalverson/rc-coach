import type { Vec2 } from '../track-types';

/**
 * Parameterized centerline with arc-length, heading, and curvature.
 * Supports efficient queries like pose lookup by arc-length or nearest arc-length to a world point.
 */
export interface CenterlineParams {
	/** Original normalized points. */
	points: Vec2[];
	/** Cumulative arc-length at each point (pixels). */
	arcLengths: number[];
	/** Total arc-length (pixels). */
	totalLength: number;
	/** Heading angle (radians) at each point. */
	headings: number[];
	/** Curvature (1/radius) at each point. */
	curvatures: number[];
}

/**
 * Parameterize a centerline polyline by arc-length, heading, and curvature.
 * @param points normalized [x, y] points in order along the centerline.
 * @returns parameterized centerline with s, θ, κ.
 */
export function parameterizeCenterline(points: Vec2[]): CenterlineParams {
	if (points.length < 2) throw new Error('Need at least 2 points for centerline');

	const arcLengths: number[] = [0];
	const headings: number[] = [];
	const curvatures: number[] = [];

	// Compute arc-lengths and headings.
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		const pNext = points[(i + 1) % points.length];

		const dx = pNext[0] - p[0];
		const dy = pNext[1] - p[1];
		const heading = Math.atan2(dy, dx);
		headings.push(heading);

		// Arc-length segment.
		if (i < points.length - 1) {
			const segLen = Math.hypot(dx, dy);
			arcLengths.push(arcLengths[i] + segLen);
		}
	}

	// Compute curvature via centered difference of heading (forward/backward).
	for (let i = 0; i < points.length; i++) {
		const hNext = headings[(i + 1) % headings.length];
		const hPrev = headings[i === 0 ? headings.length - 1 : i - 1];
		const dHeading = hNext - hPrev;
		const dS = arcLengths[(i + 1) % arcLengths.length] - arcLengths[i === 0 ? arcLengths.length - 1 : i - 1];
		const curv = dS > 0.1 ? dHeading / dS : 0;
		curvatures.push(curv);
	}

	const totalLength = arcLengths[arcLengths.length - 1];

	return {
		points,
		arcLengths,
		totalLength,
		headings,
		curvatures,
	};
}

/**
 * Interpolate position on the parameterized centerline at arc-length s.
 * Uses linear interpolation between the nearest points.
 * @param params centerline parameters.
 * @param s arc-length query (wrapped to [0, totalLength]).
 * @returns [x, y] position at arc-length s.
 */
export function poseAtArcLength(params: CenterlineParams, s: number): { pos: Vec2; heading: number; curvature: number } {
	const { points, arcLengths, totalLength, headings, curvatures } = params;
	const sWrapped = ((s % totalLength) + totalLength) % totalLength;

	let idx = 0;
	for (let i = 0; i < arcLengths.length; i++) {
		if (arcLengths[i] > sWrapped) {
			idx = i - 1;
			break;
		}
	}
	idx = Math.max(0, Math.min(idx, points.length - 2));

	const s0 = arcLengths[idx];
	const s1 = arcLengths[idx + 1];
	const p0 = points[idx];
	const p1 = points[idx + 1];
	const h0 = headings[idx];
	const h1 = headings[idx + 1];
	const k0 = curvatures[idx];
	const k1 = curvatures[idx + 1];

	const t = s1 > s0 ? (sWrapped - s0) / (s1 - s0) : 0;
	const x = p0[0] + t * (p1[0] - p0[0]);
	const y = p0[1] + t * (p1[1] - p0[1]);
	const heading = h0 + t * (h1 - h0);
	const curvature = k0 + t * (k1 - k0);

	return { pos: [x, y], heading, curvature };
}

/**
 * Find the arc-length s nearest to a world point.
 * Brute-force search over all segments; O(n).
 * @param params centerline parameters.
 * @param pt world [x, y] point.
 * @returns { s, distance, lateral_error_d }.
 */
export function nearestArcLength(params: CenterlineParams, pt: Vec2): { s: number; distance: number; d: number } {
	const { points, arcLengths } = params;
	let minDist = Number.POSITIVE_INFINITY;
	let bestS = 0;
	let bestD = 0;

	for (let i = 0; i < points.length; i++) {
		const p0 = points[i];
		const p1 = points[(i + 1) % points.length];
		const s0 = arcLengths[i];
		const s1 = i < points.length - 1 ? arcLengths[i + 1] : arcLengths[0] + params.totalLength;

		// Project pt onto segment p0–p1.
		const dx = p1[0] - p0[0];
		const dy = p1[1] - p0[1];
		const lenSq = dx * dx + dy * dy;
		let t = 0;
		if (lenSq > 1e-6) {
			t = Math.max(0, Math.min(1, ((pt[0] - p0[0]) * dx + (pt[1] - p0[1]) * dy) / lenSq));
		}

		const closest: Vec2 = [p0[0] + t * dx, p0[1] + t * dy];
		const dist = Math.hypot(pt[0] - closest[0], pt[1] - closest[1]);

		if (dist < minDist) {
			minDist = dist;
			bestS = s0 + t * (s1 - s0);
			// Lateral error: signed distance (+ right, - left by convention).
			const normalX = -dy / Math.sqrt(lenSq);
			const normalY = dx / Math.sqrt(lenSq);
			bestD = (pt[0] - closest[0]) * normalX + (pt[1] - closest[1]) * normalY;
		}
	}

	return { s: bestS, distance: minDist, d: bestD };
}
