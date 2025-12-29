import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	effect,
	Injector,
	inject,
	input,
	output,
	runInInjectionContext,
	signal,
	viewChild,
} from '@angular/core';
import { type Pt, pxToNorm, rectPolyPx } from '../geometry/geometry';
import type { Zone, ZoneType } from '../track-types';

@Component({
	selector: 'app-topdown-annotator',
	imports: [],
	templateUrl: './topdown-annotator.html',
	styleUrl: './topdown-annotator.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopdownAnnotator {
	readonly topdown = input.required<HTMLCanvasElement>();
	readonly zonesIn = input<Zone[]>([]);
	readonly zonesOut = output<Zone[]>();

	private readonly canvasRef =
		viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

	readonly zones = signal<Zone[]>([]);
	readonly currentType = signal<ZoneType>('jump');
	private readonly dragStart = signal<Pt | null>(null);
	private readonly preview = signal<Pt[] | null>(null);
	private readonly injector = inject(Injector);

	constructor() {
		afterNextRender(() => {
			// Bind reactive redraws only after the canvas ViewChild exists.
			runInInjectionContext(this.injector, () => {
				effect(() => {
					this.zones.set(this.zonesIn());
					this.topdown();
					this.preview();
					this.zones();
					this.redraw();
				});
			});
		});
	}

	onPointerDown(ev: PointerEvent) {
		ev.preventDefault();
		const pt = this.pointerToCanvas(ev);
		if (!pt) return;
		this.dragStart.set(pt);
		this.preview.set(null);
		this.canvasRef().nativeElement.setPointerCapture(ev.pointerId);
	}

	onPointerMove(ev: PointerEvent) {
		const start = this.dragStart();
		if (!start) return;
		const pt = this.pointerToCanvas(ev);
		if (!pt) return;
		const { width, height } = this.canvasRef().nativeElement;
		const clamped = { x: clamp(pt.x, 0, width), y: clamp(pt.y, 0, height) };
		this.preview.set(rectPolyPx(start, clamped));
	}

	onPointerUp(ev: PointerEvent) {
		const start = this.dragStart();
		const poly = this.preview();
		this.dragStart.set(null);
		this.canvasRef().nativeElement.releasePointerCapture(ev.pointerId);
		if (!start || !poly) return;

		const { width, height } = this.canvasRef().nativeElement;
		const normPoly = poly.map((p) => pxToNorm(p, width, height));
		const next: Zone = {
			id: crypto.randomUUID(),
			type: this.currentType(),
			poly: normPoly,
		};
		this.zones.update((zs) => [...zs, next]);
		this.zonesOut.emit(this.zones());
		this.preview.set(null);
	}

	undoLast() {
		this.zones.update((zs) => zs.slice(0, -1));
		this.zonesOut.emit(this.zones());
		this.redraw();
	}

	private pointerToCanvas(ev: PointerEvent): Pt | null {
		const canvas = this.canvasRef().nativeElement;
		const rect = canvas.getBoundingClientRect();
		const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
		const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
		if (Number.isNaN(x) || Number.isNaN(y)) return null;
		return { x, y };
	}

	private redraw() {
		const canvas = this.canvasRef().nativeElement;
		const ctx = canvas.getContext('2d');
		const top = this.topdown();
		if (!ctx || !top) return;
		if (top.width === 0 || top.height === 0) return;

		if (canvas.width !== top.width || canvas.height !== top.height) {
			canvas.width = top.width;
			canvas.height = top.height;
		}

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(top, 0, 0, top.width, top.height);

		const zones = this.zones();
		for (const z of zones) {
			this.drawPoly(
				ctx,
				z.poly.map((p) => ({
					x: p[0] * canvas.width,
					y: p[1] * canvas.height,
				})),
				zoneColor(z.type),
			);
		}

		const preview = this.preview();
		if (preview) {
			this.drawPoly(ctx, preview, 'rgba(0, 229, 255, 0.8)', true);
		}
	}

	private drawPoly(
		ctx: CanvasRenderingContext2D,
		pts: Pt[],
		stroke: string,
		dashed = false,
	) {
		if (pts.length === 0) return;
		ctx.save();
		ctx.lineWidth = 2;
		ctx.strokeStyle = stroke;
		ctx.fillStyle = 'rgba(0,0,0,0)';
		if (dashed) ctx.setLineDash([6, 4]);
		ctx.beginPath();
		ctx.moveTo(pts[0].x, pts[0].y);
		for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
		ctx.closePath();
		ctx.stroke();
		ctx.restore();
	}
}

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}

function zoneColor(type: ZoneType) {
	return type === 'jump' ? '#22d3ee' : '#a855f7';
}
