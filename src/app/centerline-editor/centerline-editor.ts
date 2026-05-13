import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	computed,
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
import { deriveCenterline } from '../geometry/derived-centerline';
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
	readonly snapEnabled = signal(true);
	readonly smoothPreviewEnabled = signal(true);
	readonly smoothPreviewSamples = signal(12);
	readonly simplifyTolerancePx = signal(4);
	readonly selectedPointIndex = signal<number | null>(null);
	readonly pointCount = computed(() => this.pts().length);
	readonly isUndoAvailable = computed(() => this.historyIndex() > 0);
	readonly isRedoAvailable = computed(() => {
		const idx = this.historyIndex();
		return idx >= 0 && idx < this.history().length - 1;
	});
	readonly selectedPoint = computed(() => {
		const idx = this.selectedPointIndex();
		if (idx === null) return null;
		return this.pts()[idx] ?? null;
	});

	private readonly canvasRef =
		viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
	private readonly pts = signal<Pt[]>([]);
	private readonly draggingIdx = signal<number | null>(null);
	private readonly history = signal<Pt[][]>([]);
	private readonly historyIndex = signal(-1);
	private readonly injector = inject(Injector);

	constructor() {
		afterNextRender(() => {
			runInInjectionContext(this.injector, () => {
				// Sync pts from lineIn/topdown only when those external inputs change.
				// Reading pts here would cause this effect to re-run on every user
				// edit, overwriting the live drawing state with stale input data.
				effect(() => {
					this.syncFromInput();
				});
				// Redraw whenever pts or topdown changes (user edits or new image).
				effect(() => {
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
			this.beginHistoryChange();
			this.draggingIdx.set(idx);
			this.selectedPointIndex.set(idx);
			this.canvasRef().nativeElement.setPointerCapture(ev.pointerId);
			return;
		}

		// add new point
		this.beginHistoryChange();
		const next = this.applySnapAndClamp(pt);
		const nextIndex = this.pts().length;
		this.pts.update((ps) => [...ps, next]);
		this.selectedPointIndex.set(nextIndex);
		this.emitLine();
		this.commitHistoryState();
		this.redraw();
	}

	onPointerMove(ev: PointerEvent) {
		const idx = this.draggingIdx();
		if (idx === null) return;
		const pt = this.toCanvasPoint(ev);
		if (!pt) return;
		const clamped = this.applySnapAndClamp(pt);
		this.pts.update((ps) => ps.map((p, i) => (i === idx ? clamped : p)));
		this.selectedPointIndex.set(idx);
		this.emitLine();
		this.redraw();
	}

	onPointerUp(ev: PointerEvent) {
		const idx = this.draggingIdx();
		if (idx !== null) {
			this.draggingIdx.set(null);
			this.canvasRef().nativeElement.releasePointerCapture(ev.pointerId);
			// Emit final position after drag completes.
			this.emitLine();
			this.commitHistoryState();
		}
	}

	undoLast() {
		this.undoChange();
	}

	clearLine() {
		if (this.pts().length === 0) return;
		this.beginHistoryChange();
		this.pts.set([]);
		this.selectedPointIndex.set(null);
		this.emitLine();
		this.commitHistoryState();
		this.redraw();
	}

	undoChange() {
		const idx = this.historyIndex();
		if (idx <= 0) return;
		const nextIndex = idx - 1;
		this.historyIndex.set(nextIndex);
		this.pts.set(clonePts(this.history()[nextIndex] ?? []));
		this.selectedPointIndex.set(null);
		this.emitLine();
		this.redraw();
	}

	redoChange() {
		const idx = this.historyIndex();
		const all = this.history();
		if (idx < 0 || idx >= all.length - 1) return;
		const nextIndex = idx + 1;
		this.historyIndex.set(nextIndex);
		this.pts.set(clonePts(all[nextIndex] ?? []));
		this.selectedPointIndex.set(null);
		this.emitLine();
		this.redraw();
	}

	simplifyLine() {
		const points = this.pts();
		if (points.length < 3) return;
		const simplified = simplifyPolyline(points, this.simplifyTolerancePx());
		if (simplified.length === points.length) return;
		this.beginHistoryChange();
		this.pts.set(simplified);
		this.selectedPointIndex.set(null);
		this.emitLine();
		this.commitHistoryState();
		this.redraw();
	}

	deleteSelectedPoint() {
		const idx = this.selectedPointIndex();
		if (idx === null) return;
		const points = this.pts();
		if (idx < 0 || idx >= points.length) return;
		this.beginHistoryChange();
		this.pts.set(points.filter((_, i) => i !== idx));
		this.selectedPointIndex.set(null);
		this.emitLine();
		this.commitHistoryState();
		this.redraw();
	}

	nudgeSelectedPoint(dx: number, dy: number) {
		const idx = this.selectedPointIndex();
		if (idx === null) return;
		const points = this.pts();
		if (idx < 0 || idx >= points.length) return;
		const stepPx = this.snapEnabled() ? 8 : 1;
		const base = this.snapEnabled() ? snapPoint(points[idx], 8) : points[idx];
		this.beginHistoryChange();
		const next = this.applySnapAndClamp({
			x: base.x + dx * stepPx,
			y: base.y + dy * stepPx,
		});
		this.pts.set(points.map((p, i) => (i === idx ? next : p)));
		this.emitLine();
		this.commitHistoryState();
		this.redraw();
	}

	selectPrevPoint() {
		const total = this.pts().length;
		if (total === 0) return;
		const idx = this.selectedPointIndex();
		this.selectedPointIndex.set(idx === null ? 0 : (idx - 1 + total) % total);
	}

	selectNextPoint() {
		const total = this.pts().length;
		if (total === 0) return;
		const idx = this.selectedPointIndex();
		this.selectedPointIndex.set(idx === null ? 0 : (idx + 1) % total);
	}

	onSmoothPreviewSamplesChange(rawValue: string) {
		const value = Number(rawValue);
		if (!Number.isFinite(value)) return;
		this.smoothPreviewSamples.set(clamp(Math.round(value), 3, 30));
		this.redraw();
	}

	onSmoothPreviewSamplesInput(event: Event) {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		this.onSmoothPreviewSamplesChange(target.value);
	}

	onSnapToggle(event: Event) {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		this.snapEnabled.set(target.checked);
	}

	onSmoothPreviewToggle(enabled: boolean) {
		this.smoothPreviewEnabled.set(enabled);
		this.redraw();
	}

	onSmoothPreviewToggleEvent(event: Event) {
		const target = event.target;
		if (!(target instanceof HTMLInputElement)) return;
		this.onSmoothPreviewToggle(target.checked);
	}

	private syncFromInput() {
		const top = this.topdown();
		if (!top) return;
		// Do not overwrite the live drawing state while the user is dragging.
		if (this.draggingIdx() !== null) return;
		const src = this.lineIn();
		const points = src.map(([x, y]) => ({ x: x * top.width, y: y * top.height }));
		if (pointsEqual(points, this.pts())) return;
		this.pts.set(points);
		this.resetHistory(points);
		if (points.length === 0) {
			this.selectedPointIndex.set(null);
		} else {
			const selected = this.selectedPointIndex();
			if (selected === null || selected >= points.length) {
				this.selectedPointIndex.set(points.length - 1);
			}
		}
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
			const preview = this.previewPolylinePx();
			if (preview && preview.length > 1) {
				ctx.save();
				ctx.strokeStyle = '#a78bfa';
				ctx.lineWidth = 2;
				ctx.setLineDash([4, 4]);
				ctx.beginPath();
				ctx.moveTo(preview[0].x, preview[0].y);
				for (let i = 1; i < preview.length; i++) {
					ctx.lineTo(preview[i].x, preview[i].y);
				}
				ctx.stroke();
				ctx.restore();
			}

			ctx.save();
			ctx.strokeStyle = '#22d3ee';
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(pts[0].x, pts[0].y);
			for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
			ctx.stroke();
			ctx.restore();

			ctx.save();
			const selectedIdx = this.selectedPointIndex();
			for (let i = 0; i < pts.length; i++) {
				ctx.fillStyle =
					i === selectedIdx ? '#facc15' : i === pts.length - 1 ? '#22d3ee' : '#ffffff';
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

	private applySnapAndClamp(pt: Pt): Pt {
		const { width, height } = this.canvasRef().nativeElement;
		const snapped = this.snapEnabled() ? snapPoint(pt, 8) : pt;
		return {
			x: clamp(snapped.x, 0, width),
			y: clamp(snapped.y, 0, height),
		};
	}

	private previewPolylinePx(): Pt[] | null {
		const points = this.pts();
		if (
			!this.smoothPreviewEnabled() ||
			points.length < 3 ||
			this.topdown().width <= 0 ||
			this.topdown().height <= 0
		) {
			return null;
		}
		const top = this.topdown();
		const normalized = points.map((p) => pxToNorm(p, top.width, top.height));
		const derived = deriveCenterline(normalized, {
			samplesPerSegment: this.smoothPreviewSamples(),
		});
		if (!derived) return null;
		return derived.sampledPoints.map(([x, y]) => ({
			x: x * top.width,
			y: y * top.height,
		}));
	}

	private resetHistory(points: Pt[]) {
		const snapshot = clonePts(points);
		this.history.set([snapshot]);
		this.historyIndex.set(0);
	}

	private beginHistoryChange() {
		const history = this.history();
		if (history.length === 0) {
			this.resetHistory(this.pts());
			return;
		}
		const idx = Math.max(0, this.historyIndex());
		const trimmed = history.slice(0, idx + 1);
		this.history.set(trimmed);
		this.historyIndex.set(trimmed.length - 1);
	}

	private commitHistoryState() {
		const snapshot = clonePts(this.pts());
		const history = this.history();
		if (history.length === 0) {
			this.history.set([snapshot]);
			this.historyIndex.set(0);
			return;
		}
		const idx = Math.max(0, this.historyIndex());
		const current = history[idx] ?? history[history.length - 1];
		if (pointsEqual(current, snapshot)) {
			this.historyIndex.set(idx);
			return;
		}
		const trimmed = history.slice(0, idx + 1);
		this.history.set([...trimmed, snapshot]);
		this.historyIndex.set(trimmed.length);
	}
}

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}

function clonePts(points: Pt[]): Pt[] {
	return points.map((p) => ({ x: p.x, y: p.y }));
}

function pointsEqual(a: Pt[], b: Pt[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
	}
	return true;
}

function snapPoint(pt: Pt, step: number): Pt {
	return {
		x: Math.round(pt.x / step) * step,
		y: Math.round(pt.y / step) * step,
	};
}

function simplifyPolyline(points: Pt[], tolerance: number): Pt[] {
	if (points.length <= 2) return clonePts(points);
	const first = points[0];
	const last = points[points.length - 1];
	let index = -1;
	let maxDistance = 0;

	for (let i = 1; i < points.length - 1; i++) {
		const distance = pointToSegmentDistance(points[i], first, last);
		if (distance > maxDistance) {
			index = i;
			maxDistance = distance;
		}
	}

	if (index !== -1 && maxDistance > tolerance) {
		const left = simplifyPolyline(points.slice(0, index + 1), tolerance);
		const right = simplifyPolyline(points.slice(index), tolerance);
		return [...left.slice(0, -1), ...right];
	}

	return [first, last];
}

function pointToSegmentDistance(p: Pt, a: Pt, b: Pt): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
	const projX = a.x + t * dx;
	const projY = a.y + t * dy;
	return Math.hypot(p.x - projX, p.y - projY);
}
