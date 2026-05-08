import {
cross,
dist2,
inBound,
isConvexQuad,
isQuadValid,
normToPx,
orderQuadTLTRBRBL,
orderQuadTLTRBRBLv2,
pxToNorm,
quadArea,
validateQuadTLTRBRBL,
} from './geometry';
import type { Pt } from './geometry';

// Axis-aligned 300×300 rectangle with well-separated corners
const TL: Pt = { x: 100, y: 100 };
const TR: Pt = { x: 400, y: 100 };
const BR: Pt = { x: 400, y: 400 };
const BL: Pt = { x: 100, y: 400 };
const RECT = [TL, TR, BR, BL];

// ─── pxToNorm ─────────────────────────────────────────────────────────────────

describe('pxToNorm', () => {
it('converts pixel point to normalized coords', () => {
const norm = pxToNorm({ x: 400, y: 300 }, 800, 600);
expect(norm[0]).toBeCloseTo(0.5, 6);
expect(norm[1]).toBeCloseTo(0.5, 6);
});

it('clamps to origin at (0,0)', () => {
const norm = pxToNorm({ x: 0, y: 0 }, 800, 600);
expect(norm[0]).toBe(0);
expect(norm[1]).toBe(0);
});

it('returns [1,1] at bottom-right corner', () => {
const norm = pxToNorm({ x: 800, y: 600 }, 800, 600);
expect(norm[0]).toBe(1);
expect(norm[1]).toBe(1);
});
});

// ─── normToPx ─────────────────────────────────────────────────────────────────

describe('normToPx', () => {
it('converts normalized point back to pixel coords', () => {
const px = normToPx([0.5, 0.5], 800, 600);
expect(px.x).toBeCloseTo(400, 6);
expect(px.y).toBeCloseTo(300, 6);
});

it('round-trips through pxToNorm and back', () => {
const original = { x: 320, y: 240 };
const norm = pxToNorm(original, 640, 480);
const back = normToPx(norm, 640, 480);
expect(back.x).toBeCloseTo(original.x, 6);
expect(back.y).toBeCloseTo(original.y, 6);
});
});

// ─── dist2 ───────────────────────────────────────────────────────────────────

describe('dist2', () => {
it('returns 0 for identical points', () => {
expect(dist2({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
});

it('returns squared Euclidean distance', () => {
expect(dist2({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
});
});

// ─── quadArea ─────────────────────────────────────────────────────────────────

describe('quadArea', () => {
it('computes area of axis-aligned rectangle', () => {
// 300 × 300 = 90 000
expect(quadArea(RECT)).toBe(90000);
});

it('returns 0 for a degenerate (collapsed) quad', () => {
const p: Pt = { x: 50, y: 50 };
expect(quadArea([p, p, p, p])).toBe(0);
});
});

// ─── cross ────────────────────────────────────────────────────────────────────

describe('cross', () => {
it('returns positive for CCW turn', () => {
expect(cross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 })).toBeGreaterThan(0);
});

it('returns negative for CW turn', () => {
expect(cross({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeLessThan(0);
});

it('returns 0 for collinear points', () => {
expect(cross({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(0);
});
});

// ─── inBound ──────────────────────────────────────────────────────────────────

describe('inBound', () => {
it('returns true for a point inside the image', () => {
expect(inBound({ x: 200, y: 200 }, 800, 600)).toBe(true);
});

it('returns true for a point on the boundary', () => {
expect(inBound({ x: 0, y: 0 }, 800, 600)).toBe(true);
expect(inBound({ x: 800, y: 600 }, 800, 600)).toBe(true);
});

it('returns false for a point outside the image', () => {
expect(inBound({ x: -1, y: 100 }, 800, 600)).toBe(false);
expect(inBound({ x: 100, y: 601 }, 800, 600)).toBe(false);
});
});

// ─── isConvexQuad ─────────────────────────────────────────────────────────────

describe('isConvexQuad', () => {
it('returns true for a convex axis-aligned rectangle', () => {
expect(isConvexQuad(RECT)).toBe(true);
});

it('returns false for a bow-tie (self-intersecting) quad', () => {
// TL swapped with BR creates an hourglass shape
const bowTie: Pt[] = [TL, BR, TR, BL];
expect(isConvexQuad(bowTie)).toBe(false);
});

it('returns false for a concave (arrow-head) quad', () => {
// Indent one corner toward the centroid to break convexity
const concave: Pt[] = [
{ x: 0, y: 0 },
{ x: 200, y: 0 },
{ x: 100, y: 50 }, // pushed inward
{ x: 200, y: 200 },
];
expect(isConvexQuad(concave)).toBe(false);
});
});

// ─── orderQuadTLTRBRBL (v1, deprecated) ──────────────────────────────────────

describe('orderQuadTLTRBRBL', () => {
it('orders shuffled axis-aligned rectangle correctly', () => {
const shuffled: Pt[] = [BR, TL, BL, TR];
const [tl, tr, br, bl] = orderQuadTLTRBRBL(shuffled);
expect(tl).toEqual(TL);
expect(tr).toEqual(TR);
expect(br).toEqual(BR);
expect(bl).toEqual(BL);
});

it('throws when fewer than 4 points are supplied', () => {
expect(() => orderQuadTLTRBRBL([TL, TR, BR])).toThrow();
});
});

// ─── orderQuadTLTRBRBLv2 ─────────────────────────────────────────────────────

describe('orderQuadTLTRBRBLv2', () => {
it('orders shuffled axis-aligned rectangle correctly', () => {
const shuffled: Pt[] = [BR, BL, TL, TR];
const [tl, tr, br, bl] = orderQuadTLTRBRBLv2(shuffled);
expect(tl).toEqual(TL);
expect(tr).toEqual(TR);
expect(br).toEqual(BR);
expect(bl).toEqual(BL);
});

it('places the top-most point as TL for a diamond quad', () => {
// Diamond: top, right, bottom, left (already in valid CCW order)
const diamond: Pt[] = [
{ x: 200, y: 50 },  // top  → TL (smallest y)
{ x: 350, y: 200 }, // right → TR
{ x: 200, y: 350 }, // bottom → BR
{ x: 50, y: 200 },  // left → BL
];
const [tl, tr, br, bl] = orderQuadTLTRBRBLv2(diamond);
expect(tl).toEqual({ x: 200, y: 50 });
expect(tr).toEqual({ x: 350, y: 200 });
expect(br).toEqual({ x: 200, y: 350 });
expect(bl).toEqual({ x: 50, y: 200 });
});

it('throws when fewer than 4 points are supplied', () => {
expect(() => orderQuadTLTRBRBLv2([TL, TR, BR])).toThrow();
});
});

// ─── isQuadValid (legacy) ─────────────────────────────────────────────────────

describe('isQuadValid', () => {
it('returns true for a valid convex quad inside image bounds', () => {
expect(isQuadValid(RECT, 800, 600)).toBe(true);
});

it('returns false when a point is outside the image', () => {
const outsideRect: Pt[] = [
{ x: -10, y: 100 },
TR,
BR,
BL,
];
expect(isQuadValid(outsideRect, 800, 600)).toBe(false);
});

it('returns false when two points are too close', () => {
const tooClose: Pt[] = [TL, { x: 110, y: 100 }, BR, BL]; // TL and second point are 10px apart
expect(isQuadValid(tooClose, 800, 600)).toBe(false);
});

it('returns false for a bow-tie quad', () => {
const bowTie: Pt[] = [TL, BR, TR, BL];
expect(isQuadValid(bowTie, 800, 600)).toBe(false);
});

it('returns false for a quad with too small an area', () => {
// 40×40 = 1 600 px² – below the 5 000 threshold
const tiny: Pt[] = [
{ x: 100, y: 100 },
{ x: 140, y: 100 },
{ x: 140, y: 140 },
{ x: 100, y: 140 },
];
expect(isQuadValid(tiny, 800, 600)).toBe(false);
});

it('returns false when fewer than 4 points are supplied', () => {
expect(isQuadValid([TL, TR, BR], 800, 600)).toBe(false);
});
});

// ─── validateQuadTLTRBRBL ────────────────────────────────────────────────────

describe('validateQuadTLTRBRBL', () => {
it('returns ok:true for a valid quad', () => {
expect(validateQuadTLTRBRBL(RECT, 800, 600)).toEqual({ ok: true });
});

it('returns ok:false when not exactly 4 points', () => {
const result = validateQuadTLTRBRBL([TL, TR, BR], 800, 600);
expect(result.ok).toBe(false);
if (!result.ok) expect(result.reason).toMatch(/4 points/i);
});

it('returns ok:false when a point is outside the image', () => {
const pts: Pt[] = [{ x: -5, y: 100 }, TR, BR, BL];
const result = validateQuadTLTRBRBL(pts, 800, 600);
expect(result.ok).toBe(false);
if (!result.ok) expect(result.reason).toMatch(/outside/i);
});

it('returns ok:false when two points are too close together', () => {
// Move TR to be only 10 px from TL
const pts: Pt[] = [TL, { x: 110, y: 100 }, BR, BL];
const result = validateQuadTLTRBRBL(pts, 800, 600);
expect(result.ok).toBe(false);
if (!result.ok) expect(result.reason).toMatch(/too close/i);
});

it('returns ok:false for a bow-tie (non-convex) quad', () => {
const bowTie: Pt[] = [TL, BR, TR, BL]; // self-intersecting
const result = validateQuadTLTRBRBL(bowTie, 800, 600);
expect(result.ok).toBe(false);
if (!result.ok) expect(result.reason).toMatch(/convex|bow-tie/i);
});

it('returns ok:false for a tiny (degenerate) quad', () => {
// 40×40 = 1 600 px² – below default 5 000 threshold
const tiny: Pt[] = [
{ x: 100, y: 100 },
{ x: 140, y: 100 },
{ x: 140, y: 140 },
{ x: 100, y: 140 },
];
const result = validateQuadTLTRBRBL(tiny, 800, 600);
expect(result.ok).toBe(false);
if (!result.ok) expect(result.reason).toMatch(/area|degenerate/i);
});

it('respects custom minAreaPx2 option', () => {
// A 40×40 quad (area 1 600) is valid when minAreaPx2 is lowered to 1 000
const tiny: Pt[] = [
{ x: 100, y: 100 },
{ x: 140, y: 100 },
{ x: 140, y: 140 },
{ x: 100, y: 140 },
];
const result = validateQuadTLTRBRBL(tiny, 800, 600, {
minAreaPx2: 1000,
minPointSeparationPx: 10,
});
expect(result).toEqual({ ok: true });
});

it('respects custom minPointSeparationPx option', () => {
// Points 10 px apart are invalid by default but valid with a 5 px threshold
const pts: Pt[] = [
{ x: 100, y: 100 },
{ x: 110, y: 100 },
{ x: 110, y: 110 },
{ x: 100, y: 110 },
];
const strict = validateQuadTLTRBRBL(pts, 800, 600, { minPointSeparationPx: 20 });
expect(strict.ok).toBe(false);

const lenient = validateQuadTLTRBRBL(pts, 800, 600, {
minPointSeparationPx: 5,
minAreaPx2: 1,
});
expect(lenient).toEqual({ ok: true });
});
});
