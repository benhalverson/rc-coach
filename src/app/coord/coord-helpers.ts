import { type Pt } from '../geometry/geometry';
import type { Vec2 } from '../track-types';

export type SizePx = { w: number; h: number };
export type SizeMeters = { w: number; h: number };

/**
 * Convert normalized coords (0..1) to a pixel point.
 * @param p normalized point [x,y] in 0..1
 * @param px topdown size in pixels
 */
export function normToPxPoint(p: Vec2, px: SizePx): Pt {
	return { x: p[0] * px.w, y: p[1] * px.h };
}

/**
 * Convert pixel point to normalized coords (0..1).
 * @param pt point in pixels
 * @param px topdown size in pixels
 */
export function pxToNormPoint(pt: Pt, px: SizePx): Vec2 {
	return [pt.x / px.w, pt.y / px.h];
}

/**
 * Convert normalized coords (0..1) to meters.
 * @param p normalized point [x,y] in 0..1
 * @param meters track size in meters
 */
export function normToMeters(p: Vec2, meters: SizeMeters): Vec2 {
	return [p[0] * meters.w, p[1] * meters.h];
}

/**
 * Convert meters to normalized coords (0..1).
 * @param pMeters point in meters
 * @param meters track size in meters
 */
export function metersToNorm(pMeters: Vec2, meters: SizeMeters): Vec2 {
	return [pMeters[0] / meters.w, pMeters[1] / meters.h];
}

/**
 * Convert pixel point to meters (pixel -> norm -> meters).
 * @param pt point in pixels
 * @param px topdown size in pixels
 * @param meters track size in meters
 */
export function pxToMeters(pt: Pt, px: SizePx, meters: SizeMeters): Vec2 {
	const norm = pxToNormPoint(pt, px);
	return normToMeters(norm, meters);
}

/**
 * Convert meters to pixel point (meters -> norm -> pixels).
 * @param pMeters point in meters
 * @param px topdown size in pixels
 * @param meters track size in meters
 */
export function metersToPx(pMeters: Vec2, px: SizePx, meters: SizeMeters): Pt {
	const norm = metersToNorm(pMeters, meters);
	return normToPxPoint(norm, px);
}

/**
 * Pixels per meter in X and Y.
 * @param px topdown size in pixels
 * @param meters track size in meters
 */
export function pxPerMeter(px: SizePx, meters: SizeMeters): Vec2 {
	return [px.w / meters.w, px.h / meters.h];
}
