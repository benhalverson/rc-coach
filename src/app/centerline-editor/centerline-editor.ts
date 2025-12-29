import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	afterNextRender,
	effect,
	Injector,
	inject,
	input,
	output,
	runInInjectionContext,
	signal,
	viewChild,
} from '@angular/core';
import { pxToNorm } from '../geometry/geometry';
import type { Vec2 } from '../track-types';

type Pt = { x: number; y: number };

@Component({
	selector: 'app-centerline-editor',
	templateUrl: './centerline-editor.html',
	styleUrl: './centerline-editor.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CenterlineEditor {
	readonly topdown = input.required<HTMLCanvasElement>();
	readonly lineIn = input<Vec2[]>([]);
	readonly lineOut = output<Vec2[]>();

	private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
	private readonly pts = signal<Pt[]>([]);
	private readonly draggingIdx = signal<number | null>(null);
	private readonly injector = inject(Injector);

	constructor() {
		afterNextRender(() => {
			runInInjectionContext(this.injector, () => {
				effect(() => {
					this.syncFromInput();
					this.redraw();
				});
			});
		});
	}

	onPointerDown(ev: PointerEvent) {
		ev.preventDefault();
		const pt = this.toCanvasPoint(ev);
		if (!pt) return;
		const idx = this.findNearest(pt, 10);
		if (idx !== null) {
			this.draggingIdx.set(idx);
			this.canvasRef().nativeElement.setPointerCapture(ev.pointerId);
			return;
		}

		// add new point
		this.pts.update((ps) => [...ps, pt]);
		this.emitLine();
		this.redraw();
	}

	onPointerMove(ev: PointerEvent) {
		const idx = this.draggingIdx();
		if (idx === null) return;
		const pt = this.toCanvasPoint(ev);
		if (!pt) return;
		const { width, height } = this.canvasRef().nativeElement;
		const clamped = { x: clamp(pt.x, 0, width), y: clamp(pt.y, 0, height) };
		this.pts.update((ps) => ps.map((p, i) => (i === idx ? clamped : p)));
		this.emitLine();
		this.redraw();
	}

	onPointerUp(ev: PointerEvent) {
		const idx = this.draggingIdx();
		if (idx !== null) {
			this.draggingIdx.set(null);
			this.canvasRef().nativeElement.releasePointerCapture(ev.pointerId);
		}
	}

	undoLast() {
		this.pts.update((ps) => ps.slice(0, -1));
		this.emitLine();
		this.redraw();
	}

	clearLine() {
		this.pts.set([]);
		this.emitLine();
		this.redraw();
	}

	private syncFromInput() {
		const top = this.topdown();
		if (!top) return;
		const src = this.lineIn();
		this.pts.set(src.map(([x, y]) => ({ x: x * top.width, y: y * top.height })));
	}

	private emitLine() {
		const top = this.topdown();
		const canvas = this.canvasRef().nativeElement;
		if (!top || canvas.width === 0 || canvas.height === 0) return;
		const norm = this.pts().map((p) => pxToNorm(p, top.width, top.height));
		this.lineOut.emit(norm);
	}

	private redraw() {
		const top = this.topdown();
		const canvas = this.canvasRef().nativeElement;
		const ctx = canvas.getContext('2d');
		if (!top || !ctx) return;
		if (canvas.width !== top.width || canvas.height !== top.height) {
			canvas.width = top.width;
			canvas.height = top.height;
		}
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(top, 0, 0, top.width, top.height);

		const pts = this.pts();
		if (pts.length > 0) {
			ctx.save();
			ctx.strokeStyle = '#22d3ee';
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
			ctx.stroke();
			ctx.restore();

			ctx.save();
			for (let i = 0; i < pts.length; i++) {
				ctx.fillStyle = i === pts.length - 1 ? '#22d3ee' : '#ffffff';
				ctx.strokeStyle = '#111827';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(pts[i].x, pts[i].y, 5, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
			ctx.restore();
		}
	}

	private toCanvasPoint(ev: PointerEvent): Pt | null {
		const canvas = this.canvasRef().nativeElement;
		const rect = canvas.getBoundingClientRect();
		const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
		const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
		if (Number.isNaN(x) || Number.isNaN(y)) return null;
		return { x, y };
	}

	private findNearest(pt: Pt, maxDist: number): number | null {
		const ps = this.pts();
		let bestIdx: number | null = null;
		let best = maxDist * maxDist;
		for (let i = 0; i < ps.length; i++) {
			const dx = ps[i].x - pt.x;
			const dy = ps[i].y - pt.y;
			const d2 = dx * dx + dy * dy;
			if (d2 <= best) {
				best = d2;
				bestIdx = i;
			}
		}
		return bestIdx;
	}
}

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}
