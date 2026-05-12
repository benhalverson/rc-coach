import type { Vec2 } from '../track-types';

export type DerivedCenterline = {
	rawPoints: Vec2[];
	sampledPoints: Vec2[];
	totalLength: number;
	isSmoothed: boolean;
};

export type DeriveCenterlineOptions = {
	samplesPerSegment?: number;
};

export function deriveCenterline(
	points: Vec2[],
	options: DeriveCenterlineOptions = {},
): DerivedCenterline | null {
	if (points.length < 2) return null;

	const samplesPerSegment = Math.max(
		1,
		Math.floor(options.samplesPerSegment ?? 12),
	);
	const sampledPoints =
		points.length === 2
			? sampleLine(points[0], points[1], samplesPerSegment)
			: sampleCatmullRom(points, samplesPerSegment);

	return {
		rawPoints: points.map((p) => [...p] as Vec2),
		sampledPoints,
		totalLength: polylineLength(sampledPoints),
		isSmoothed: points.length > 2,
	};
}

function sampleLine(a: Vec2, b: Vec2, samples: number): Vec2[] {
	const pts: Vec2[] = [];
	for (let i = 0; i <= samples; i++) {
		const t = i / samples;
		pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
	}
	return pts;
}

function sampleCatmullRom(points: Vec2[], samplesPerSegment: number): Vec2[] {
	const pts: Vec2[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[Math.max(0, i - 1)];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[Math.min(points.length - 1, i + 2)];

		for (let j = 0; j < samplesPerSegment; j++) {
			if (i > 0 && j === 0) continue;
			const t = j / samplesPerSegment;
			pts.push([
				clamp01(catmullRom(p0[0], p1[0], p2[0], p3[0], t)),
				clamp01(catmullRom(p0[1], p1[1], p2[1], p3[1], t)),
			]);
		}
	}

	pts.push([...points[points.length - 1]] as Vec2);
	return pts;
}

function catmullRom(
	p0: number,
	p1: number,
	p2: number,
	p3: number,
	t: number,
): number {
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		0.5 *
		(2 * p1 +
			(-p0 + p2) * t +
			(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
			(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
	);
}

function polylineLength(points: Vec2[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		total += Math.hypot(
			points[i][0] - points[i - 1][0],
			points[i][1] - points[i - 1][1],
		);
	}
	return total;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
