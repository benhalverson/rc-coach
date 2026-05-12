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
	if (points.length < 2)
		throw new Error('Need at least 2 points for centerline');

	const arcLengths: number[] = [0];
	const headings: number[] = [];
	const curvatures: number[] = [];

	const segmentHeadings: number[] = [];
	const segmentLengths: number[] = [];

	// Compute arc-lengths and headings for the open centerline polyline.
	for (let i = 0; i < points.length - 1; i++) {
		const p = points[i];
		const pNext = points[i + 1];
		const dx = pNext[0] - p[0];
		const dy = pNext[1] - p[1];
		const segLen = Math.hypot(dx, dy);

		segmentLengths.push(segLen);
		segmentHeadings.push(Math.atan2(dy, dx));
		arcLengths.push(arcLengths[i] + segLen);
	}

	for (let i = 0; i < points.length; i++) {
		if (i === points.length - 1) {
			headings.push(segmentHeadings[segmentHeadings.length - 1] ?? 0);
		} else {
			headings.push(segmentHeadings[i] ?? headings[headings.length - 1] ?? 0);
		}
	}

	// Compute curvature at interior vertices only. Endpoints do not invent a closing turn.
	for (let i = 0; i < points.length; i++) {
		if (i === 0 || i === points.length - 1) {
			curvatures.push(0);
			continue;
		}

		const hNext = segmentHeadings[i];
		const hPrev = segmentHeadings[i - 1];
		const dHeading = normalizeAngle(hNext - hPrev);
		const dS = segmentLengths[i - 1] + segmentLengths[i];
		curvatures.push(dS > 1e-6 ? dHeading / dS : 0);
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
 * @param s arc-length query (clamped to [0, totalLength]).
 * @returns [x, y] position at arc-length s.
 */
export function poseAtArcLength(
	params: CenterlineParams,
	s: number,
): { pos: Vec2; heading: number; curvature: number } {
	const { points, arcLengths, totalLength, curvatures } = params;
	if (totalLength <= 0) {
		return { pos: points[0], heading: 0, curvature: 0 };
	}

	const clampedS = Math.max(0, Math.min(s, totalLength));

	let idx = 0;
	for (let i = 1; i < arcLengths.length; i++) {
		if (arcLengths[i] >= clampedS) {
			idx = i - 1;
			break;
		}
	}
	idx = Math.max(0, Math.min(idx, points.length - 2));

	const s0 = arcLengths[idx];
	const s1 = arcLengths[idx + 1];
	const p0 = points[idx];
	const p1 = points[idx + 1];
	const k0 = curvatures[idx];
	const k1 = curvatures[idx + 1];

	const t = s1 > s0 ? (clampedS - s0) / (s1 - s0) : 0;
	const x = p0[0] + t * (p1[0] - p0[0]);
	const y = p0[1] + t * (p1[1] - p0[1]);
	const heading = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
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
export function nearestArcLength(
	params: CenterlineParams,
	pt: Vec2,
): { s: number; distance: number; d: number } {
	const { points, arcLengths } = params;
	let minDist = Number.POSITIVE_INFINITY;
	let bestS = 0;
	let bestD = 0;

	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i];
		const p1 = points[i + 1];
		const s0 = arcLengths[i];
		const s1 = arcLengths[i + 1];

		// Project pt onto segment p0–p1.
		const dx = p1[0] - p0[0];
		const dy = p1[1] - p0[1];
		const lenSq = dx * dx + dy * dy;
		let t = 0;
		if (lenSq > 1e-6) {
			t = Math.max(
				0,
				Math.min(1, ((pt[0] - p0[0]) * dx + (pt[1] - p0[1]) * dy) / lenSq),
			);
		}

		const closest: Vec2 = [p0[0] + t * dx, p0[1] + t * dy];
		const dist = Math.hypot(pt[0] - closest[0], pt[1] - closest[1]);

		if (dist < minDist) {
			minDist = dist;
			bestS = s0 + t * (s1 - s0);
			// Lateral error: signed distance (+ right, - left by convention).
			if (lenSq > 1e-6) {
				const len = Math.sqrt(lenSq);
				const normalX = -dy / len;
				const normalY = dx / len;
				bestD = (pt[0] - closest[0]) * normalX + (pt[1] - closest[1]) * normalY;
			} else {
				bestD = 0;
			}
		}
	}

	return { s: bestS, distance: minDist, d: bestD };
}

function normalizeAngle(angle: number): number {
	let a = angle;
	while (a > Math.PI) a -= 2 * Math.PI;
	while (a < -Math.PI) a += 2 * Math.PI;
	return a;
}
