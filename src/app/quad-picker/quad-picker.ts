import type { ElementRef } from '@angular/core';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	inject,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import type { Pt } from '../geometry/geometry';

@Component({
	selector: 'app-quad-picker',
	imports: [],
	templateUrl: './quad-picker.html',
	styleUrl: './quad-picker.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuadPicker {
	image = input.required<HTMLImageElement>();
	quad = output<Pt[]>();

	private readonly destroyRef = inject(DestroyRef);
	private readonly canvasRef =
		viewChild.required<ElementRef<HTMLCanvasElement>>('c');

	private readonly draggingIndex = signal<number | null>(null);

	readonly pts = signal<Pt[]>([]);

	constructor() {
		effect(() => {
			const image = this.image();
			const canvas = this.canvasRef().nativeElement;
			this.syncCanvasToImage(canvas, image);
			this.draw(canvas, image, this.pts());
		});

		afterNextRender(() => this.bindPointerEvents());
	}

	reset() {
		this.draggingIndex.set(null);
		this.pts.set([]);
	}

	emitQuad() {
		const pts = this.pts();
		if (pts.length !== 4) return;
		this.quad.emit(pts);
	}

	private bindPointerEvents() {
		const canvas = this.canvasRef().nativeElement;
		fromEvent<PointerEvent>(canvas, 'pointerdown')
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((e) => this.onPointerDown(e));

		fromEvent<PointerEvent>(canvas, 'pointermove')
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((e) => this.onPointerMove(e));

		fromEvent<PointerEvent>(canvas, 'pointerup')
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.draggingIndex.set(null));

		fromEvent<PointerEvent>(canvas, 'pointercancel')
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.draggingIndex.set(null));
	}

	private onPointerDown(e: PointerEvent) {
		const canvas = this.canvasRef().nativeElement;
		const p = this.getCanvasXY(canvas, e);

		const hit = this.hitTest(p);
		if (hit !== null) {
			this.draggingIndex.set(hit);
			canvas.setPointerCapture(e.pointerId);
			return;
		}

		const pts = this.pts();
		if (pts.length >= 4) return;

		this.pts.set([...pts, p]);
	}

	private onPointerMove(e: PointerEvent) {
		const idx = this.draggingIndex();
		if (idx === null) return;

		const canvas = this.canvasRef().nativeElement;
		const p = this.getCanvasXY(canvas, e);

		const next = this.pts().slice();
		next[idx] = p;
		this.pts.set(next);
	}

	private getCanvasXY(canvas: HTMLCanvasElement, e: PointerEvent): Pt {
		const rect = canvas.getBoundingClientRect();
		const sx = canvas.width / rect.width;
		const sy = canvas.height / rect.height;
		return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
	}

	private hitTest(p: Pt): number | null {
		const pts = this.pts();
		const r = 18; // px (in canvas pixel space)
		const r2 = r * r;

		for (let i = 0; i < pts.length; i++) {
			const dx = pts[i].x - p.x;
			const dy = pts[i].y - p.y;
			if (dx * dx + dy * dy <= r2) return i;
		}
		return null;
	}

	private syncCanvasToImage(canvas: HTMLCanvasElement, img: HTMLImageElement) {
		// keep internal pixel size aligned with source image for accurate point picking
		const w = img.naturalWidth || img.width;
		const h = img.naturalHeight || img.height;

		if (w && h && (canvas.width !== w || canvas.height !== h)) {
			canvas.width = w;
			canvas.height = h;
		}
	}

	private draw(canvas: HTMLCanvasElement, img: HTMLImageElement, pts: Pt[]) {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0);

		// polygon
		if (pts.length >= 2) {
			ctx.lineWidth = 3;
			ctx.strokeStyle = '#00e5ff';
			ctx.beginPath();
			ctx.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
			if (pts.length === 4) ctx.closePath();
			ctx.stroke();
		}

		// handles
		const labels = ['TL', 'TR', 'BR', 'BL'];
		for (let i = 0; i < pts.length; i++) {
			const p = pts[i];

			ctx.fillStyle = '#00e5ff';
			ctx.beginPath();
			ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
			ctx.fill();

			ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
			ctx.fillStyle = '#000';
			ctx.fillText(labels[i] ?? `${i + 1}`, p.x + 10, p.y - 10);
		}
	}
}
