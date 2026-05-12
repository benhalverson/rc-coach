import type { TrackDef } from '../track-types';

export type TrackExportValidationInput = {
	track: TrackDef | null;
	hasTopDown: boolean;
	hasQuad: boolean;
	hasSourceImage: boolean;
};

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

export function getTrackExportErrors({
	track,
	hasTopDown,
	hasQuad,
	hasSourceImage,
}: TrackExportValidationInput): string[] {
	const errors: string[] = [];

	if (!track || !hasTopDown || !hasQuad || !hasSourceImage) {
		errors.push('Top-down image or quad selection missing.');
		return errors;
	}

	if (!track.name || track.name.trim().length === 0) {
		errors.push('Track name is required.');
	}
	if (!hasValidPositiveDimensions(track.widthMeters, track.heightMeters)) {
		errors.push('Track dimensions must be greater than 0.');
	}

	if (!track.zones || track.zones.length === 0) {
		errors.push('At least one zone is required.');
	} else {
		for (const zone of track.zones) {
			if (!zone.poly || zone.poly.length < 3) {
				errors.push(`Zone ${zone.id} (${zone.type}) must have at least 3 points.`);
			}
		}
	}

	return errors;
}
