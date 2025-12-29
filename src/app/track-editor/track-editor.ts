import { CommonModule, JsonPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { orderQuadTLTRBRBL, type Pt } from '../geometry/geometry';
import { Opencv } from '../opencv';
import { QuadPicker } from '../quad-picker/quad-picker';
import { TopdownAnnotator } from '../topdown-annotator/topdown-annotator';
import type { TrackDef, Zone } from '../track-types';

@Component({
	selector: 'app-track-editor',
	imports: [JsonPipe, QuadPicker, CommonModule, TopdownAnnotator],
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
	readonly topDownDataUrl = signal<string | null>(null);
	readonly topDownW = signal(1600);
	readonly topDownH = signal(900);

	readonly name = signal('RC Track');

	readonly widthMeters = signal(20);
	readonly heightMeters = signal(12);

	readonly zones = signal<Zone[]>([]);

	constructor() {
		effect(() => {
			const top = this.topDown();
			if (!top || top.width === 0 || top.height === 0) {
				this.topDownDataUrl.set(null);
				return;
			}
			const url = top.toDataURL('image/png');
			console.log('dataURL generated', {
				length: url.length,
				prefix: url.slice(0, 50),
			});
			this.topDownDataUrl.set(url);
		});
	}

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

		console.log('onQuad: before warp', {
			imgW: img.width,
			imgH: img.height,
			quad: ordered,
			outW,
			outH,
			cvReady: !!(window as unknown as { cv?: { Mat: unknown } }).cv?.Mat,
		});

		let canvas: HTMLCanvasElement;
		try {
			canvas = this.cv.warpPerspective(img, ordered, outW, outH);
			console.log('warp succeeded, canvas dims', {
				w: canvas.width,
				h: canvas.height,
			});
		} catch (err) {
			console.error('warpPerspective failed', err);
			canvas = this.fallbackDraw(img, outW, outH);
		}

		const blankAfterWarp = this.isBlankCanvas(canvas);
		console.log('warp result', {
			w: canvas.width,
			h: canvas.height,
			blankAfterWarp,
		});
		if (blankAfterWarp) {
			console.log('warp produced blank canvas, using fallback');
			canvas = this.fallbackDraw(img, outW, outH);
		}

		this.topDown.set(canvas);

		// move to scale step
		this.step.set('scale');
	}

	private fallbackDraw(
		img: HTMLImageElement,
		w: number,
		h: number,
	): HTMLCanvasElement {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const ctx = c.getContext('2d');
		if (ctx) ctx.drawImage(img, 0, 0, w, h);
		return c;
	}

	private isBlankCanvas(c: HTMLCanvasElement): boolean {
		const ctx = c.getContext('2d');
		if (!ctx) return true;
		const sampleW = Math.min(8, c.width || 1);
		const sampleH = Math.min(8, c.height || 1);
		const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
		const samples: { r: number; g: number; b: number; a: number }[] = [];
		for (let i = 0; i < data.length && samples.length < 4; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			const a = data[i + 3];
			samples.push({ r, g, b, a });
			if (r !== 0 || g !== 0 || b !== 0) {
				console.log('isBlankCanvas: found non-zero pixel', { r, g, b, a });
				return false;
			}
		}
		console.log('isBlankCanvas: all sampled pixels are zero', samples);
		return true;
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
