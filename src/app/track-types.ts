export type Vec2 = [number, number];

export type ZoneType = 'jump' | 'wallride';

export type Zone = {
	id: string;
	type: ZoneType;
	poly: Vec2[];
	params?: Record<string, number>;
};

export type TrackDef = {
	id: string;
	name: string;
	widthMeters: number;
	heightMeters: number;
	zones: Zone[];
	centerline?: Vec2[];
	topdownPx: { w: number; h: number };
	import: {
		srcImageName: string;
		srcQuadPx: {
			x: number;
			y: number;
		}[];
	};
};
