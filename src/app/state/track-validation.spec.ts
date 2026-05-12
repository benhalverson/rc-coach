import { describe, expect, it } from 'vitest';
import { TRACK_SCHEMA_VERSION, type TrackDef } from '../track-types';
import {
	getTrackExportErrors,
	getTrackExportValidation,
	hasValidPositiveDimensions,
	validateTrackDef,
} from './track-validation';

function makeTrack(overrides: Partial<TrackDef> = {}): TrackDef {
	return {
		schemaVersion: TRACK_SCHEMA_VERSION,
		id: 'track-1',
		name: 'Test Track',
		widthMeters: 20,
		heightMeters: 12,
		topdownPx: { w: 1600, h: 900 },
		zones: [
			{
				id: 'zone-1',
				type: 'jump',
				poly: [
					[0, 0],
					[1, 0],
					[1, 1],
				],
			},
		],
		centerline: [
			[0.1, 0.5],
			[0.9, 0.5],
		],
		import: {
			srcImageName: 'track.png',
			srcQuadPx: [
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				{ x: 100, y: 100 },
				{ x: 0, y: 100 },
			],
		},
		...overrides,
	};
}

describe('hasValidPositiveDimensions', () => {
	it('accepts finite positive dimensions', () => {
		expect(hasValidPositiveDimensions(20, 12)).toBe(true);
		expect(hasValidPositiveDimensions(0.1, 0.1)).toBe(true);
	});

	it('rejects zero, negative, and NaN dimensions', () => {
		expect(hasValidPositiveDimensions(0, 12)).toBe(false);
		expect(hasValidPositiveDimensions(20, 0)).toBe(false);
		expect(hasValidPositiveDimensions(-1, 12)).toBe(false);
		expect(hasValidPositiveDimensions(20, -1)).toBe(false);
		expect(hasValidPositiveDimensions(Number.NaN, 12)).toBe(false);
		expect(hasValidPositiveDimensions(20, Number.NaN)).toBe(false);
	});
});

describe('validateTrackDef', () => {
	it('normalizes legacy unversioned track.json as v1 with a warning', () => {
		const legacy = makeTrack();
		delete legacy.schemaVersion;

		const result = validateTrackDef(legacy);

		expect(result.ok).toBe(true);
		expect(result.track?.schemaVersion).toBe(TRACK_SCHEMA_VERSION);
		expect(result.warnings.join(' ')).toMatch(/Legacy unversioned/i);
	});

	it('accepts an explicit v1 track.json', () => {
		const result = validateTrackDef(makeTrack());

		expect(result.ok).toBe(true);
		expect(result.track?.schemaVersion).toBe(TRACK_SCHEMA_VERSION);
		expect(result.errors).toEqual([]);
	});

	it('rejects unsupported schema versions', () => {
		const result = validateTrackDef({ ...makeTrack(), schemaVersion: 2 });

		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(
			/Unsupported track\.json schemaVersion/,
		);
	});

	it('rejects invalid dimensions', () => {
		const result = validateTrackDef(makeTrack({ widthMeters: 0 }));

		expect(result.ok).toBe(false);
		expect(result.errors).toContain('Track dimensions must be greater than 0.');
	});

	it('rejects invalid normalized zone points', () => {
		const result = validateTrackDef(
			makeTrack({
				zones: [
					{
						id: 'bad-zone',
						type: 'jump',
						poly: [
							[0, 0],
							[1.2, 0],
							[1, 1],
						],
					},
				],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/normalized between 0 and 1/);
	});

	it('rejects invalid zone types', () => {
		const result = validateTrackDef({
			...makeTrack(),
			zones: [
				{
					id: 'bad-zone',
					type: 'boost',
					poly: [
						[0, 0],
						[1, 0],
						[1, 1],
					],
				},
			],
		});

		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/type must be jump or wallride/);
	});

	it('rejects invalid centerline points', () => {
		const result = validateTrackDef(
			makeTrack({
				centerline: [
					[0, 0],
					[Number.NaN, 0.5],
				],
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(/Centerline point 2/);
	});

	it('allows draft imports with empty zones and centerline warnings', () => {
		const result = validateTrackDef(makeTrack({ zones: [], centerline: [] }), {
			allowDraft: true,
		});

		expect(result.ok).toBe(true);
		expect(result.warnings.join(' ')).toMatch(/no zones|fewer than 2/i);
	});

	it('rejects topdown PNG and JSON dimension mismatches', () => {
		const result = validateTrackDef(makeTrack(), {
			imageSize: { w: 800, h: 450 },
		});

		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(
			/do not match track\.json topdownPx/,
		);
	});

	it('rejects invalid import quad metadata when present', () => {
		const result = validateTrackDef(
			makeTrack({
				import: {
					srcImageName: 'track.png',
					srcQuadPx: [],
				},
			}),
		);

		expect(result.ok).toBe(false);
		expect(result.errors.join(' ')).toMatch(
			/srcQuadPx must contain exactly 4 points/,
		);
	});
});

describe('getTrackExportErrors', () => {
	it('requires a top-down image before export', () => {
		expect(
			getTrackExportErrors({
				track: makeTrack(),
				hasTopDown: false,
			}),
		).toEqual(['Top-down image missing.']);
	});

	it('validates blank names, invalid dimensions, missing zones, and missing centerline', () => {
		expect(
			getTrackExportErrors({
				track: makeTrack({
					name: '   ',
					widthMeters: Number.NaN,
					zones: [],
					centerline: [],
				}),
				hasTopDown: true,
			}),
		).toEqual([
			'Track name is required.',
			'Track dimensions must be greater than 0.',
			'At least one zone is required.',
			'At least two centerline points are required.',
		]);
	});

	it('returns a normalized v1 track for valid export input', () => {
		const result = getTrackExportValidation({
			track: makeTrack(),
			hasTopDown: true,
			topDownSize: { w: 1600, h: 900 },
		});

		expect(result.ok).toBe(true);
		expect(result.track?.schemaVersion).toBe(TRACK_SCHEMA_VERSION);
	});
});
