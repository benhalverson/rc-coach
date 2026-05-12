import {
	TRACK_SCHEMA_VERSION,
	type TrackDef,
	type Vec2,
	type Zone,
	type ZoneType,
} from '../track-types';

export type ImageSize = { w: number; h: number };

export type TrackValidationResult =
	| {
			ok: true;
			errors: [];
			warnings: string[];
			track: TrackDef;
	  }
	| {
			ok: false;
			errors: string[];
			warnings: string[];
			track: null;
	  };

export type TrackExportValidationInput = {
	track: TrackDef | null;
	hasTopDown: boolean;
	topDownSize?: ImageSize | null;
};

export type TrackValidationOptions = {
	allowDraft?: boolean;
	imageSize?: ImageSize | null;
};

const ZONE_TYPES = new Set<ZoneType>(['jump', 'wallride']);

export function hasValidPositiveDimensions(
	widthMeters: number,
	heightMeters: number,
): boolean {
	return (
		Number.isFinite(widthMeters) &&
		widthMeters > 0 &&
		Number.isFinite(heightMeters) &&
		heightMeters > 0
	);
}

export function validateTrackDef(
	value: unknown,
	options: TrackValidationOptions = {},
): TrackValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const allowDraft = options.allowDraft ?? false;

	if (!isRecord(value)) {
		return {
			ok: false,
			errors: ['Invalid track.json: expected an object.'],
			warnings,
			track: null,
		};
	}

	const schemaVersion = value['schemaVersion'];
	if (schemaVersion === undefined) {
		warnings.push('Legacy unversioned track.json treated as schemaVersion 1.');
	} else if (schemaVersion !== TRACK_SCHEMA_VERSION) {
		errors.push(
			`Unsupported track.json schemaVersion: ${String(schemaVersion)}.`,
		);
	}

	const id = readTrimmedString(value['id']);
	if (!id) errors.push('Track id is required.');

	const name = readTrimmedString(value['name']);
	if (!name) errors.push('Track name is required.');

	const widthMeters = value['widthMeters'];
	const heightMeters = value['heightMeters'];
	if (
		typeof widthMeters !== 'number' ||
		typeof heightMeters !== 'number' ||
		!hasValidPositiveDimensions(widthMeters, heightMeters)
	) {
		errors.push('Track dimensions must be greater than 0.');
	}

	const topdownPx = validateImageSize(value['topdownPx'], 'topdownPx', errors);
	if (topdownPx && options.imageSize) {
		const image = options.imageSize;
		if (image.w !== topdownPx.w || image.h !== topdownPx.h) {
			errors.push(
				`topdown.png dimensions (${image.w}x${image.h}) do not match track.json topdownPx (${topdownPx.w}x${topdownPx.h}).`,
			);
		}
	}

	const zones = validateZones(value['zones'], allowDraft, errors, warnings);
	const centerline = validateCenterline(
		value['centerline'],
		allowDraft,
		errors,
		warnings,
	);
	const importMeta = validateImportMeta(value['import'], errors);

	if (errors.length > 0) {
		return { ok: false, errors, warnings, track: null };
	}

	const track: TrackDef = {
		schemaVersion: TRACK_SCHEMA_VERSION,
		id: id ?? '',
		name: name ?? '',
		widthMeters: widthMeters as number,
		heightMeters: heightMeters as number,
		topdownPx: topdownPx ?? { w: 0, h: 0 },
		zones,
		centerline,
	};

	if (importMeta) track.import = importMeta;

	return { ok: true, errors: [], warnings, track };
}

export function getTrackExportValidation({
	track,
	hasTopDown,
	topDownSize,
}: TrackExportValidationInput): TrackValidationResult {
	if (!track || !hasTopDown) {
		return {
			ok: false,
			errors: ['Top-down image missing.'],
			warnings: [],
			track: null,
		};
	}

	return validateTrackDef(track, {
		allowDraft: false,
		imageSize: topDownSize ?? null,
	});
}

export function getTrackExportErrors(
	input: TrackExportValidationInput,
): string[] {
	return getTrackExportValidation(input).errors;
}

function validateZones(
	value: unknown,
	allowDraft: boolean,
	errors: string[],
	warnings: string[],
): Zone[] {
	if (!Array.isArray(value)) {
		errors.push('Track zones must be an array.');
		return [];
	}

	if (value.length === 0) {
		if (allowDraft) warnings.push('Track has no zones yet.');
		else errors.push('At least one zone is required.');
		return [];
	}

	const zones: Zone[] = [];
	for (let i = 0; i < value.length; i++) {
		const raw = value[i];
		const prefix = `Zone ${i + 1}`;
		if (!isRecord(raw)) {
			errors.push(`${prefix} must be an object.`);
			continue;
		}

		const id = readTrimmedString(raw['id']);
		if (!id) errors.push(`${prefix} id is required.`);

		const type = raw['type'];
		if (type !== 'jump' && type !== 'wallride') {
			errors.push(`${prefix} type must be jump or wallride.`);
		}

		const poly = validateVec2Array(raw['poly'], `${prefix} polygon`, errors);
		if (poly.length < 3) {
			errors.push(`${prefix} polygon must have at least 3 points.`);
		}

		const params = validateParams(raw['params'], `${prefix} params`, errors);
		if (id && ZONE_TYPES.has(type as ZoneType) && poly.length >= 3) {
			const zone: Zone = { id, type: type as ZoneType, poly };
			if (params) zone.params = params;
			zones.push(zone);
		}
	}

	return zones;
}

function validateCenterline(
	value: unknown,
	allowDraft: boolean,
	errors: string[],
	warnings: string[],
): Vec2[] {
	if (value === undefined) {
		if (allowDraft) warnings.push('Track has no centerline yet.');
		else errors.push('At least two centerline points are required.');
		return [];
	}

	if (!Array.isArray(value)) {
		errors.push('Track centerline must be an array.');
		return [];
	}

	const line = validateVec2Array(value, 'Centerline', errors);
	if (line.length < 2) {
		if (allowDraft) warnings.push('Track centerline has fewer than 2 points.');
		else errors.push('At least two centerline points are required.');
	}

	return line;
}

function validateImportMeta(
	value: unknown,
	errors: string[],
): TrackDef['import'] {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		errors.push('Import metadata must be an object.');
		return undefined;
	}

	const srcImageName = readTrimmedString(value['srcImageName']);
	if (!srcImageName) {
		errors.push('Import metadata srcImageName is required.');
	}

	const rawQuad = value['srcQuadPx'];
	if (!Array.isArray(rawQuad) || rawQuad.length !== 4) {
		errors.push('Import metadata srcQuadPx must contain exactly 4 points.');
		return undefined;
	}

	const srcQuadPx = rawQuad.map((raw, i) => {
		if (!isRecord(raw)) {
			errors.push(
				`Import metadata srcQuadPx point ${i + 1} must be an object.`,
			);
			return { x: 0, y: 0 };
		}

		const x = raw['x'];
		const y = raw['y'];
		if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
			errors.push(`Import metadata srcQuadPx point ${i + 1} must be finite.`);
			return { x: 0, y: 0 };
		}

		return { x, y };
	});

	if (!srcImageName) return undefined;
	return { srcImageName, srcQuadPx };
}

function validateVec2Array(
	value: unknown,
	label: string,
	errors: string[],
): Vec2[] {
	if (!Array.isArray(value)) {
		errors.push(`${label} must be an array.`);
		return [];
	}

	const points: Vec2[] = [];
	for (let i = 0; i < value.length; i++) {
		const pt = value[i];
		if (
			!Array.isArray(pt) ||
			pt.length !== 2 ||
			!isFiniteNumber(pt[0]) ||
			!isFiniteNumber(pt[1])
		) {
			errors.push(`${label} point ${i + 1} must be a finite [x, y] pair.`);
			continue;
		}

		if (!isNormalized(pt[0]) || !isNormalized(pt[1])) {
			errors.push(
				`${label} point ${i + 1} must be normalized between 0 and 1.`,
			);
			continue;
		}

		points.push([pt[0], pt[1]]);
	}

	return points;
}

function validateImageSize(
	value: unknown,
	label: string,
	errors: string[],
): ImageSize | null {
	if (!isRecord(value)) {
		errors.push(`${label} is required.`);
		return null;
	}

	const w = value['w'];
	const h = value['h'];
	if (!isFiniteNumber(w) || w <= 0 || !isFiniteNumber(h) || h <= 0) {
		errors.push(`${label} dimensions must be greater than 0.`);
		return null;
	}

	return { w, h };
}

function validateParams(
	value: unknown,
	label: string,
	errors: string[],
): Record<string, number> | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		errors.push(`${label} must be an object.`);
		return undefined;
	}

	const params: Record<string, number> = {};
	for (const [key, paramValue] of Object.entries(value)) {
		if (!isFiniteNumber(paramValue)) {
			errors.push(`${label}.${key} must be a finite number.`);
			continue;
		}
		params[key] = paramValue;
	}

	return params;
}

function readTrimmedString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0
		? value.trim()
		: null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isNormalized(value: number): boolean {
	return value >= 0 && value <= 1;
}
