import { CommonModule, JsonPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { orderQuadTLTRBRBL, type Pt } from '../geometry/geometry';
import { Opencv } from '../opencv';
import { QuadPicker } from '../quad-picker/quad-picker';
import { TopdownAnnotator } from '../topdown-annotator/topdown-annotator';
import { CenterlineEditor } from '../centerline-editor/centerline-editor';
import type { TrackDef, Vec2, Zone, ZoneType } from '../track-types';

@Component({
	selector: 'app-track-editor',
	imports: [JsonPipe, QuadPicker, CommonModule, TopdownAnnotator, CenterlineEditor],
	templateUrl: './track-editor.html',
	styleUrl: './track-editor.css',
})
export class TrackEditor {
	private readonly cv = inject(Opencv);
	private readonly annotator = viewChild<TopdownAnnotator>('annotator');

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
	readonly centerline = signal<Vec2[]>([]);
	readonly centerlinePointsSvg = computed(() =>
		this.centerline()
			.map((p) => `${p[0] * 100},${p[1] * 100}`)
			.join(' '),
	);

	// Scale calibration via measurement
	readonly measureMode = signal(false);
	readonly measurePt1 = signal<Pt | null>(null);
	readonly measurePt2 = signal<Pt | null>(null);
	readonly measurePixelDist = computed(() => {
		const p1 = this.measurePt1();
		const p2 = this.measurePt2();
		if (!p1 || !p2) return null;
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		return Math.hypot(dx, dy);
	});
	readonly measureRealDist = signal(0);
	readonly pixelsPerMeter = computed(() => {
		const pxDist = this.measurePixelDist();
		const realDist = this.measureRealDist();
		if (!pxDist || realDist <= 0) return null;
		return pxDist / realDist;
	});

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
			centerline: this.centerline(),
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
		this.centerline.set([]);
		this.measureMode.set(false);
		this.measurePt1.set(null);
		this.measurePt2.set(null);
		this.measureRealDist.set(0);
	}

	onMeasureCanvasClick(ev: MouseEvent, canvas: HTMLCanvasElement) {
		if (!this.measureMode()) return;
		const rect = canvas.getBoundingClientRect();
		const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
		const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
		const pt = { x, y };

		if (!this.measurePt1()) {
			this.measurePt1.set(pt);
		} else if (!this.measurePt2()) {
			this.measurePt2.set(pt);
		}
	}

	applyMeasure() {
		const ppm = this.pixelsPerMeter();
		const top = this.topDown();
		if (!ppm || !top) return;

		const w = top.width / ppm;
		const h = top.height / ppm;
		this.widthMeters.set(w);
		this.heightMeters.set(h);
		this.measureMode.set(false);
		this.measurePt1.set(null);
		this.measurePt2.set(null);
		this.measureRealDist.set(0);
	}

	cancelMeasure() {
		this.measureMode.set(false);
		this.measurePt1.set(null);
		this.measurePt2.set(null);
		this.measureRealDist.set(0);
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
		return this.zones().filter((z) => z.type === type).length;
	}

	onCenterlineChange(line: Vec2[]) {
		this.centerline.set(line);
	}
}
type Step =
	| 'scale'
	| 'upload'
	| 'quad'
	| 'annotate'
	| 'export'
	| 'centerline'
	| 'viewer'
