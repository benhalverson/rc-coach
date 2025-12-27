import type { Vec2 } from '../track-types';

export type Pt = { x: number; y: number };

export function rectPolyPx(a: Pt, b: Pt): Pt[] {
	const x1 = Math.min(a.x, b.x),
		x2 = Math.max(a.x, b.x);
	const y1 = Math.min(a.y, b.y),
		y2 = Math.max(a.y, b.y);
	return [
		{ x: x1, y: y1 },
		{ x: x2, y: y1 },
		{ x: x2, y: y2 },
		{ x: x1, y: y2 },
	];
}

export function pxToNorm(p: Pt, w: number, h: number): Vec2 {
	return [p.x / w, p.y / h];
}

export function normToPx(p: Vec2, w: number, h: number): Pt {
	return { x: p[0] * w, y: p[1] * h };
}

/**
 * Reorder 4 arbitrary points into TL, TR, BR, BL.
 * Robust for most “quad” selections.
 */
export function orderQuadTLTRBRBL(pts: Pt[]): Pt[] {
	if (pts.length !== 4) throw new Error('Need 4 points');

	const sum = (p: Pt) => p.x + p.y;
	const diff = (p: Pt) => p.x - p.y;

	const tl = pts.reduce((a, b) => (sum(a) < sum(b) ? a : b));
	const br = pts.reduce((a, b) => (sum(a) > sum(b) ? a : b));
	const tr = pts.reduce((a, b) => (diff(a) > diff(b) ? a : b));
	const bl = pts.reduce((a, b) => (diff(a) < diff(b) ? a : b));

	return [tl, tr, br, bl];
}
