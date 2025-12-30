import { CommonModule, JsonPipe } from '@angular/common';
import { Component, inject, viewChild } from '@angular/core';
import { CenterlineDemoComponent } from '../centerline-demo/centerline-demo';
import { CenterlineEditor } from '../centerline-editor/centerline-editor';
import { type Pt } from '../geometry/geometry';
import { QuadPicker } from '../quad-picker/quad-picker';
import { TrackStore } from '../state/track-store';
import { TopdownAnnotator } from '../topdown-annotator/topdown-annotator';
import type { Vec2, ZoneType } from '../track-types';

@Component({
	selector: 'app-track-editor',
	imports: [
		JsonPipe,
		QuadPicker,
		CommonModule,
		TopdownAnnotator,
		CenterlineEditor,
		CenterlineDemoComponent,
	],
	templateUrl: './track-editor.html',
	styleUrl: './track-editor.css',
})
export class TrackEditor {
	private readonly annotator = viewChild<TopdownAnnotator>('annotator');
	private readonly store = inject(TrackStore);

	// Proxies to TrackStore signals/computed
	readonly step = this.store.step;
	readonly srcImage = this.store.srcImage;
	readonly srcImageName = this.store.srcImageName;
	readonly quadPx = this.store.quadPx;
	readonly topDown = this.store.topDown;
	readonly topDownDataUrl = this.store.topDownDataUrl;
	readonly topDownW = this.store.topDownW;
	readonly topDownH = this.store.topDownH;
	readonly name = this.store.name;
	readonly widthMeters = this.store.widthMeters;
	readonly heightMeters = this.store.heightMeters;
	readonly zones = this.store.zones;
	readonly centerline = this.store.centerline;
	readonly centerlinePointsSvg = this.store.centerlinePointsSvg;
	readonly measureMode = this.store.measureMode;
	readonly measurePt1 = this.store.measurePt1;
	readonly measurePt2 = this.store.measurePt2;
	readonly measurePixelDist = this.store.measurePixelDist;
	readonly measureRealDist = this.store.measureRealDist;
	readonly pixelsPerMeter = this.store.pixelsPerMeter;
	readonly canGoAnnotate = this.store.canGoAnnotate;
	readonly trackDef = this.store.trackDef;
	readonly exportErrors = this.store.exportErrors;
	readonly exportValid = this.store.exportValid;

	// Import proxies
	readonly importTopdownImg = this.store.importTopdownImg;
	readonly importTrack = this.store.importTrack;
	readonly canImport = this.store.canImport;
	readonly pixelsPerMeterAuto = this.store.pixelsPerMeterAuto;

	onFile(ev: Event) {
		this.store.onFile(ev);
	}

	onQuad(rawPts: Pt[]) {
		this.store.onQuad(rawPts);
	}

	// Fallback helpers now live in TrackStore

	resetAll() {
		this.store.resetAll();
	}

	onMeasureCanvasClick(ev: MouseEvent, canvas: HTMLCanvasElement) {
		this.store.onMeasureCanvasClick(ev, canvas);
	}

	applyMeasure() {
		this.store.applyMeasure();
	}

	cancelMeasure() {
		this.store.cancelMeasure();
	}

	downloadTopdownPng() {
		this.store.downloadTopdownPng();
	}

	downloadTrackJson() {
		this.store.downloadTrackJson();
	}

	selectZone(id: string) {
		const ann = this.annotator();
		if (ann) {
			ann.selectedZoneId.set(id);
		}
	}

	deleteZone(id: string) {
		this.zones.update((zs) => zs.filter((z) => z.id !== id));
	}

	countZonesByType(type: ZoneType): number {
		return this.store.countZonesByType(type);
	}

	onCenterlineChange(line: Vec2[]) {
		this.store.onCenterlineChange(line);
	}

	onImportTopdownFile(ev: Event) {
		this.store.onImportTopdownFile(ev);
	}

	onImportTrackJsonFile(ev: Event) {
		this.store.onImportTrackJsonFile(ev);
	}

	applyImport() {
		this.store.applyImport();
	}
}
// Using store-provided signals; no local Step type needed.
