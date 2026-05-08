import { describe, expect, it } from 'vitest';
import type { TrackDef } from '../track-types';
import {
	getTrackExportErrors,
	hasValidPositiveDimensions,
} from './track-validation';

function makeTrack(overrides: Partial<TrackDef> = {}): TrackDef {
	return {
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
		import: {
			srcImageName: 'track.png',
			srcQuadPx: [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
				{ x: 0, y: 1 },
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

describe('getTrackExportErrors', () => {
	it('requires a top-down image before export', () => {
		expect(
			getTrackExportErrors({
				track: makeTrack(),
				hasTopDown: false,
				hasQuad: true,
				hasSourceImage: true,
			}),
		).toEqual(['Top-down image or quad selection missing.']);
	});

	it('requires a quad selection before export', () => {
		expect(
			getTrackExportErrors({
				track: makeTrack(),
				hasTopDown: true,
				hasQuad: false,
				hasSourceImage: true,
			}),
		).toEqual(['Top-down image or quad selection missing.']);
	});

	it('validates blank names, invalid dimensions, and missing zones', () => {
		expect(
			getTrackExportErrors({
				track: makeTrack({
					name: '   ',
					widthMeters: Number.NaN,
					zones: [],
				}),
				hasTopDown: true,
				hasQuad: true,
				hasSourceImage: true,
			}),
		).toEqual([
			'Track name is required.',
			'Track dimensions must be greater than 0.',
			'At least one zone is required.',
		]);
	});
});
