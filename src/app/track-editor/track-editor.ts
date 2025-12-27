import { CommonModule, JsonPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { orderQuadTLTRBRBL, type Pt } from '../geometry/geometry';
import { Opencv } from '../opencv';
import { QuadPicker } from '../quad-picker/quad-picker';
import type { TrackDef, Zone } from '../track-types';

@Component({
	selector: 'app-track-editor',
	imports: [JsonPipe, QuadPicker, CommonModule],
	templateUrl: './track-editor.html',
	styleUrl: './track-editor.css',
})
export class TrackEditor {
	private readonly cv = inject(Opencv);

	readonly step = signal<Step>('upload');

	readonly srcImage = signal<HTMLImageElement | null>(null);

	readonly srcImageName = signal<string>('track.png');

	readonly quadPx = signal<Pt[] | null>(null);

	readonly topDown = signal<HTMLCanvasElement | null>(null);
	readonly topDownW = signal(1600);
	readonly topDownH = signal(900);

	readonly name = signal('RC Track');

	readonly widthMeters = signal(20);
	readonly heightMeters = signal(12);

	readonly zones = signal<Zone[]>([]);

	readonly canGoAnnotate = computed(
		() =>
			!!this.topDown() &&
			this.widthMeters() > 0 &&
			this.heightMeters() > 0 &&
			this.name().trim().length > 0,
	);

	readonly trackDef = computed<TrackDef | null>(() => {
		const top = this.topDown();
		const quad = this.quadPx();
		const img = this.srcImage();
		if (!top || !quad || !img) return null;

		return {
			id: crypto.randomUUID(),
			name: this.name().trim(),
			widthMeters: this.widthMeters(),
			heightMeters: this.heightMeters(),
			topdownPx: { w: top.width, h: top.height },
			zones: this.zones(),
			import: {
				srcImageName: this.srcImageName(),
				srcQuadPx: quad,
			},
		};
	});

	async onFile(ev: Event) {
		const input = ev.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		this.srcImageName.set(file.name);

		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			this.srcImage.set(img);
			this.quadPx.set(null);
			this.topDown.set(null);
			this.zones.set([]);
			this.step.set('quad');
		};
		img.src = url;
	}

	async onQuad(rawPts: Pt[]) {
		// ensure TL/TR/BR/BL
		const ordered = orderQuadTLTRBRBL(rawPts);
		this.quadPx.set(ordered);

		const img = this.srcImage();
		if (!img) return;

		await this.cv.ready();

		const outW = this.topDownW();
		const outH = this.topDownH();

		const warped = this.cv.warpPerspective(img, ordered, outW, outH);
		this.topDown.set(warped);

		// move to scale step
		this.step.set('scale');
	}

	resetAll() {
		this.step.set('upload');
		this.srcImage.set(null);
		this.quadPx.set(null);
		this.topDown.set(null);
		this.zones.set([]);
	}

	downloadTopdownPng() {
		const top = this.topDown();
		if (!top) return;

		top.toBlob((blob) => {
			if (!blob) return;
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = 'topdown.png';
			a.click();
			URL.revokeObjectURL(a.href);
		}, 'image/png');
	}

	downloadTrackJson() {
		const t = this.trackDef();
		if (!t) return;

		const blob = new Blob([JSON.stringify(t, null, 2)], {
			type: 'application/json',
		});
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'track.json';
		a.click();
		URL.revokeObjectURL(a.href);
	}
}

type Step =
	| 'scale'
	| 'upload'
	| 'quad'
	| 'pick-quad'
	| 'define-zones'
	| 'annotate'
	| 'export'
	| 'review';
