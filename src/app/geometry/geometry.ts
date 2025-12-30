import type { Vec2 } from '../track-types';

export type Pt = { x: number; y: number };

/**
 * Build axis-aligned rectangle polygon from two points.
 * @param a first corner in pixels
 * @param b opposite corner in pixels
 * @returns polygon points in pixel space (TL, TR, BR, BL)
 */
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

/**
 * Convert pixel point to normalized coords (0..1) given width/height.
 * @param p point in pixels
 * @param w canvas width in pixels
 * @param h canvas height in pixels
 */
export function pxToNorm(p: Pt, w: number, h: number): Vec2 {
	return [p.x / w, p.y / h];
}

/**
 * Convert normalized coords (0..1) to pixel point given width/height.
 * @param p normalized point [x,y]
 * @param w canvas width in pixels
 * @param h canvas height in pixels
 */
export function normToPx(p: Vec2, w: number, h: number): Pt {
	return { x: p[0] * w, y: p[1] * h };
}

/**
 * Reorder 4 arbitrary points into TL, TR, BR, BL.
 * Robust for most “quad” selections.
 * @deprecated use orderQuadTLTRBRBLv2 instead
 * @param pts four points in any order (pixel space)
 * @returns points ordered TL, TR, BR, BL
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

export function orderQuadTLTRBRBLv2(raw: Pt[]): Pt[] {
	if (raw.length !== 4) throw new Error('Need exactly 4 points');

	// 1) centroid
	const c = raw.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), {
		x: 0,
		y: 0,
	});
	c.x /= 4;
	c.y /= 4;

	// 2) sort by angle around centroid (CCW)
	const byAngle = raw
		.map((p) => ({ p, a: Math.atan2(p.y - c.y, p.x - c.x) }))
		.sort((u, v) => u.a - v.a)
		.map((u) => u.p);

	// 3) rotate so index 0 is top-left (smallest y, then smallest x)
	let tlIdx = 0;
	for (let i = 1; i < 4; i++) {
		const a = byAngle[i];
		const b = byAngle[tlIdx];
		if (a.y < b.y || (a.y === b.y && a.x < b.x)) tlIdx = i;
	}
	const rot = (i: number) => byAngle[(tlIdx + i) % 4];

	let ordered: Pt[] = [rot(0), rot(1), rot(2), rot(3)]; // TL, ?, BR-ish, ?

	// 4) Ensure second point is TR (top edge), not BL (winding flip)
	// Compare y of candidate TR vs candidate BL: TR should be "higher" (smaller y)
	if (ordered[1].y > ordered[3].y) {
		ordered = [ordered[0], ordered[3], ordered[2], ordered[1]];
	}

	return ordered; // TL,TR,BR,BL
}

export function dist2(a: Pt, b: Pt): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}

export function quadArea(pts: Pt[]): number {
	let a = 0;
	for (let i = 0; i < 4; i++) {
		const j = (i + 1) % 4;

		a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
	}
	return Math.abs(a) / 2;
}

export function cross(p: Pt, q: Pt, r: Pt): number {
	return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

export function isConvexQuad(p: Pt[]) {
	const s1 = Math.sign(cross(p[0], p[1], p[2]));
	const s2 = Math.sign(cross(p[1], p[2], p[3]));
	const s3 = Math.sign(cross(p[2], p[3], p[0]));
	const s4 = Math.sign(cross(p[3], p[0], p[1]));
	return s1 !== 0 && s1 === s2 && s2 === s3 && s3 === s4;
}

export function inBound(p: Pt, w: number, h: number): boolean {
	return p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;
}

export function isQuadValid(pts: Pt[], w: number, h: number): boolean {
	if (pts.length !== 4) return false;

	if (!pts.every((p) => inBound(p, w, h))) return false;

	const minD2 = 20 * 20; // min distance between points
	for (let i = 0; i < 4; i++) {
		for (let j = i + 1; j < 4; j++) {
			if (dist2(pts[i], pts[j]) < minD2) return false;
		}
	}

	if (!isConvexQuad(pts)) return false;
	if (quadArea(pts) < 5000) return false;

	return true;
}


function inBounds(p: Pt, w: number, h: number): boolean {
	return p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;
}

/**
 * Validate ordered quad prior to homography.
 * - points inside image bounds
 * - no points nearly identical
 * - convex (not a bow-tie)
 * - sufficient area
 */
export function validateQuadTLTRBRBL(
	pts: Pt[],
	imageW: number,
	imageH: number,
	opts?: {
		minPointSeparationPx?: number;
		minAreaPx2?: number;
	},
): { ok: true } | { ok: false; reason: string } {
	if (pts.length !== 4) return { ok: false, reason: 'Need exactly 4 points' };

	const minSep = opts?.minPointSeparationPx ?? 20;
	const minSep2 = minSep * minSep;
	const minArea = opts?.minAreaPx2 ?? 5000;

	for (const p of pts) {
		if (!inBounds(p, imageW, imageH)) {
			return { ok: false, reason: 'A point is outside the image bounds' };
		}
	}

	for (let i = 0; i < 4; i++) {
		for (let j = i + 1; j < 4; j++) {
			if (dist2(pts[i], pts[j]) < minSep2) {
				return { ok: false, reason: 'Two points are too close together' };
			}
		}
	}

	if (!isConvexQuad(pts)) {
		return { ok: false, reason: 'Quad is self-intersecting or non-convex (bow-tie)' };
	}

	if (quadArea(pts) < minArea) {
		return { ok: false, reason: 'Quad area is too small / nearly degenerate' };
	}

	return { ok: true };
}
