import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CenterlineDemoComponent } from '../centerline-demo/centerline-demo';
import { TrackStore } from '../state/track-store';
import type { ZoneType } from '../track-types';

type ViewerZoneOverlay = {
	id: string;
	fill: string;
	points: string;
	stroke: string;
	type: ZoneType;
};

type ViewerPoint = {
	cx: number;
	cy: number;
	id: string;
};

@Component({
	selector: 'app-track-viewer',
	imports: [RouterLink, CenterlineDemoComponent],
	templateUrl: './track-viewer.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Local-file viewer for exported tracks.
 * Reuses validated import state from `TrackStore`, renders overlay inspection controls,
 * and exposes the replay prototype without changing editor-specific workflows.
 */
export class TrackViewer {
	private readonly store = inject(TrackStore);

	readonly name = this.store.name;
	readonly widthMeters = this.store.widthMeters;
	readonly heightMeters = this.store.heightMeters;
	readonly zones = this.store.zones;
	readonly centerline = this.store.centerline;
	readonly derivedCenterlinePointsSvg = this.store.derivedCenterlinePointsSvg;
	readonly topDown = this.store.topDown;
	readonly topDownDataUrl = this.store.topDownDataUrl;
	readonly trackDef = this.store.trackDef;

	readonly importTopdownImg = this.store.importTopdownImg;
	readonly importTrack = this.store.importTrack;
	readonly canImport = this.store.canImport;
	readonly pixelsPerMeterAuto = this.store.pixelsPerMeterAuto;
	readonly importJsonError = this.store.importJsonError;
	readonly importWarnings = this.store.importWarnings;
	readonly importPngError = this.store.importPngError;
	readonly importCompatibilityError = this.store.importCompatibilityError;

	readonly showZones = signal(true);
	readonly showRawCenterline = signal(true);
	readonly showDerivedCenterline = signal(true);
	readonly overlayOpacity = signal(90);

	readonly zoneOverlays = computed<ViewerZoneOverlay[]>(() =>
		this.zones().map((zone) => ({
			id: zone.id,
			type: zone.type,
			points: zone.poly.map(([x, y]) => `${x * 100},${y * 100}`).join(' '),
			stroke: zoneColor(zone.type),
			fill: zoneFill(zone.type),
		})),
	);

	readonly centerlinePoints = computed<ViewerPoint[]>(() =>
		this.centerline().map(([x, y], index) => ({
			id: `${index}-${x}-${y}`,
			cx: x * 100,
			cy: y * 100,
		})),
	);
	readonly rawCenterlinePointsSvg = computed(() =>
		this.centerline()
			.map(([x, y]) => `${x * 100},${y * 100}`)
			.join(' '),
	);

	/**
	 * Handle selection of a top-down PNG export for the viewer route.
	 * @param ev change event from the PNG file input.
	 */
	onImportTopdownFile(ev: Event) {
		this.store.onImportTopdownFile(ev);
	}

	/**
	 * Handle selection of a validated track JSON export for the viewer route.
	 * @param ev change event from the JSON file input.
	 */
	onImportTrackJsonFile(ev: Event) {
		this.store.onImportTrackJsonFile(ev);
	}

	/**
	 * Apply the currently selected local export into viewer mode.
	 * Reuses the shared import pipeline but lands on the dedicated viewer step.
	 */
	applyImport() {
		this.store.applyImport('viewer');
	}

	/**
	 * Clear all shared track state and reset the viewer back to its empty local-file state.
	 */
	resetViewer() {
		this.store.resetAll();
	}
}

/**
 * Viewer overlay stroke colors.
 * Jump zones render in cyan while wallrides render in purple to match existing editor colors.
 */
function zoneColor(type: ZoneType): string {
	return type === 'jump' ? '#22d3ee' : '#a855f7';
}

/**
 * Viewer overlay fill colors.
 * Uses the same zone hue as the stroke with a translucent fill for readable inspection overlays.
 */
function zoneFill(type: ZoneType): string {
	return type === 'jump' ? 'rgba(34, 211, 238, 0.18)' : 'rgba(168, 85, 247, 0.18)';
}
