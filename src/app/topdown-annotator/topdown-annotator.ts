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
import { normToPx, type Pt, pxToNorm, rectPolyPx } from '../geometry/geometry';
import { queryZonesAtPoint } from '../geometry/zone-query';
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

	readonly currentType = signal<ZoneType>('jump');
	readonly drawMode = signal<'rect' | 'polygon'>('rect');
	readonly selectedZoneId = signal<string | null>(null);
	readonly selectedVertexIndex = signal<number | null>(null);
	readonly polygonPoints = signal<Pt[]>([]);
	private readonly dragStart = signal<Pt | null>(null);
	private readonly draggingVertex = signal(false);
	private readonly preview = signal<Pt[] | null>(null);
	private readonly injector = inject(Injector);

	constructor() {
		afterNextRender(() => {
			// Bind reactive redraws only after the canvas ViewChild exists.
			runInInjectionContext(this.injector, () => {
				effect(() => {
					this.topdown();
					this.preview();
					this.zonesIn();
					this.selectedZoneId();
					this.selectedVertexIndex();
					this.polygonPoints();
					this.redraw();
				});
			});
		});
	}

	onPointerDown(ev: PointerEvent) {
		ev.preventDefault();
		const pt = this.pointerToCanvas(ev);
		if (!pt) return;

		if (this.drawMode() === 'polygon') {
			// In polygon mode always add a vertex; never let zone selection interrupt drawing
			this.polygonPoints.update((pts) => [...pts, pt]);
			return;
		}

		const vertexHit = this.findSelectedVertexAtPoint(pt, 10);
		if (vertexHit !== null) {
			this.selectedVertexIndex.set(vertexHit);
			this.draggingVertex.set(true);
			this.canvasRef().nativeElement.setPointerCapture(ev.pointerId);
			return;
		}

		const edgeHit = this.findSelectedEdgeAtPoint(pt, 8);
		if (edgeHit) {
			this.insertVertex(edgeHit.insertIndex, edgeHit.point);
			this.selectedVertexIndex.set(edgeHit.insertIndex);
			return;
		}

		// Rect mode: check if clicking on existing zone for selection
		const clickedZone = this.findZoneAtPoint(pt);
		if (clickedZone) {
			this.selectedZoneId.set(clickedZone.id);
			this.selectedVertexIndex.set(null);
			return;
		}

		// Clear selection if clicking empty space, then start rectangle drag
		this.selectedZoneId.set(null);
		this.selectedVertexIndex.set(null);
		this.dragStart.set(pt);
		this.preview.set(null);
		this.canvasRef().nativeElement.setPointerCapture(ev.pointerId);
	}

	onPointerMove(ev: PointerEvent) {
		if (this.draggingVertex()) {
			const pt = this.pointerToCanvas(ev);
			if (!pt) return;
			const { width, height } = this.canvasRef().nativeElement;
			this.updateSelectedVertex({
				x: clamp(pt.x, 0, width),
				y: clamp(pt.y, 0, height),
			});
			return;
		}

		if (this.drawMode() === 'polygon') {
			const pt = this.pointerToCanvas(ev);
			if (!pt) return;
			const polyPts = this.polygonPoints();
			if (polyPts.length > 0) {
				// Show preview line from last point to cursor
				this.preview.set([...polyPts, pt]);
			}
			return;
		}

		const start = this.dragStart();
		if (!start) return;
		const pt = this.pointerToCanvas(ev);
		if (!pt) return;
		const { width, height } = this.canvasRef().nativeElement;
		const clamped = { x: clamp(pt.x, 0, width), y: clamp(pt.y, 0, height) };
		this.preview.set(rectPolyPx(start, clamped));
	}

	onPointerUp(ev: PointerEvent) {
		if (this.draggingVertex()) {
			this.draggingVertex.set(false);
			this.canvasRef().nativeElement.releasePointerCapture(ev.pointerId);
			return;
		}

		if (this.drawMode() === 'polygon') return;

		const start = this.dragStart();
		const poly = this.preview();
		this.dragStart.set(null);
		// Only release pointer capture if we actually captured it
		if (start) {
			this.canvasRef().nativeElement.releasePointerCapture(ev.pointerId);
		}
		if (!start || !poly) return;

		// Reject degenerate rectangles smaller than 5px in either dimension
		const rectW = poly[1].x - poly[0].x;
		const rectH = poly[2].y - poly[0].y;
		if (rectW < 5 || rectH < 5) {
			this.preview.set(null);
			return;
		}

		const { width, height } = this.canvasRef().nativeElement;
		const normPoly = poly.map((p) => pxToNorm(p, width, height));
		const next: Zone = {
			id: crypto.randomUUID(),
			type: this.currentType(),
			poly: normPoly,
		};
		const updated = [...this.zonesIn(), next];
		this.zonesOut.emit(updated);
		this.selectedZoneId.set(next.id);
		this.selectedVertexIndex.set(null);
		this.preview.set(null);
	}

	undoLast() {
		const updated = this.zonesIn().slice(0, -1);
		this.zonesOut.emit(updated);
		if (!updated.some((z) => z.id === this.selectedZoneId())) {
			this.selectedZoneId.set(null);
			this.selectedVertexIndex.set(null);
		}
		this.redraw();
	}

	finishPolygon() {
		const pts = this.polygonPoints();
		if (pts.length < 3) return; // Need at least 3 points

		const { width, height } = this.canvasRef().nativeElement;
		const normPoly = pts.map((p) => pxToNorm(p, width, height));
		const next: Zone = {
			id: crypto.randomUUID(),
			type: this.currentType(),
			poly: normPoly,
		};
		const updated = [...this.zonesIn(), next];
		this.zonesOut.emit(updated);
		this.selectedZoneId.set(next.id);
		this.selectedVertexIndex.set(null);
		this.polygonPoints.set([]);
		this.preview.set(null);
	}

	cancelPolygon() {
		this.polygonPoints.set([]);
		this.preview.set(null);
	}

	setDrawMode(mode: 'rect' | 'polygon') {
		if (mode === 'rect') {
			// Clear any in-progress polygon when switching back to rect
			this.polygonPoints.set([]);
			this.preview.set(null);
		} else {
			// Clear any in-progress rect drag when switching to polygon
			this.dragStart.set(null);
			this.preview.set(null);
		}
		this.drawMode.set(mode);
	}

	deleteSelected() {
		const id = this.selectedZoneId();
		if (!id) return;
		const updated = this.zonesIn().filter((z) => z.id !== id);
		this.zonesOut.emit(updated);
		this.selectedZoneId.set(null);
		this.selectedVertexIndex.set(null);
	}

	deleteSelectedVertex() {
		const id = this.selectedZoneId();
		const idx = this.selectedVertexIndex();
		if (!id || idx === null) return;

		const zone = this.zonesIn().find((z) => z.id === id);
		if (!zone || zone.poly.length <= 3 || idx < 0 || idx >= zone.poly.length) {
			return;
		}

		const updatedPoly = zone.poly.filter((_, i) => i !== idx);
		const updated = this.zonesIn().map((z) =>
			z.id === id ? { ...z, poly: updatedPoly } : z,
		);
		this.zonesOut.emit(updated);
		this.selectedVertexIndex.set(
			updatedPoly.length > 0 ? Math.min(idx, updatedPoly.length - 1) : null,
		);
	}

	clearSelection() {
		this.selectedZoneId.set(null);
		this.selectedVertexIndex.set(null);
	}

	changeSelectedType(newType: ZoneType) {
		const id = this.selectedZoneId();
		if (!id) return;
		const updated = this.zonesIn().map((z) =>
			z.id === id ? { ...z, type: newType } : z,
		);
		this.zonesOut.emit(updated);
	}

	private updateSelectedVertex(pt: Pt) {
		const id = this.selectedZoneId();
		const idx = this.selectedVertexIndex();
		if (!id || idx === null) return;

		const canvas = this.canvasRef().nativeElement;
		if (canvas.width === 0 || canvas.height === 0) return;
		const norm = pxToNorm(pt, canvas.width, canvas.height);
		const updated = this.zonesIn().map((z) => {
			if (z.id !== id || idx < 0 || idx >= z.poly.length) return z;
			const poly = z.poly.map((p, i) => (i === idx ? norm : p));
			return { ...z, poly };
		});
		this.zonesOut.emit(updated);
	}

	private insertVertex(insertIndex: number, pt: Pt) {
		const id = this.selectedZoneId();
		if (!id) return;

		const canvas = this.canvasRef().nativeElement;
		if (canvas.width === 0 || canvas.height === 0) return;
		const norm = pxToNorm(pt, canvas.width, canvas.height);
		const updated = this.zonesIn().map((z) => {
			if (z.id !== id) return z;
			const poly = [...z.poly];
			poly.splice(insertIndex, 0, norm);
			return { ...z, poly };
		});
		this.zonesOut.emit(updated);
	}

	private findSelectedVertexAtPoint(pt: Pt, maxDist: number): number | null {
		const selected = this.selectedZone();
		if (!selected) return null;
		const canvas = this.canvasRef().nativeElement;
		const maxDist2 = maxDist * maxDist;
		let bestIdx: number | null = null;
		let best = maxDist2;

		selected.poly.forEach((norm, idx) => {
			const px = normToPx(norm, canvas.width, canvas.height);
			const d = distSq(pt, px);
			if (d <= best) {
				best = d;
				bestIdx = idx;
			}
		});

		return bestIdx;
	}

	private findSelectedEdgeAtPoint(
		pt: Pt,
		maxDist: number,
	): { insertIndex: number; point: Pt } | null {
		const selected = this.selectedZone();
		if (!selected) return null;
		const canvas = this.canvasRef().nativeElement;
		let best: { insertIndex: number; point: Pt; dist: number } | null = null;

		for (let i = 0; i < selected.poly.length; i++) {
			const a = normToPx(selected.poly[i], canvas.width, canvas.height);
			const b = normToPx(
				selected.poly[(i + 1) % selected.poly.length],
				canvas.width,
				canvas.height,
			);
			const closest = closestPointOnSegment(pt, a, b);
			const dist = Math.sqrt(distSq(pt, closest));
			if (dist <= maxDist && (!best || dist < best.dist)) {
				best = { insertIndex: i + 1, point: closest, dist };
			}
		}

		return best ? { insertIndex: best.insertIndex, point: best.point } : null;
	}

	private selectedZone(): Zone | null {
		const id = this.selectedZoneId();
		return id ? (this.zonesIn().find((z) => z.id === id) ?? null) : null;
	}

	private findZoneAtPoint(pt: Pt): Zone | null {
		const canvas = this.canvasRef().nativeElement;
		if (canvas.width === 0 || canvas.height === 0) return null;

		const norm = pxToNorm(pt, canvas.width, canvas.height);
		const { containing } = queryZonesAtPoint(norm, this.zonesIn());
		return containing.at(-1) ?? null;
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

		const zones = this.zonesIn();
		const selectedId = this.selectedZoneId();
		for (const z of zones) {
			const isSelected = z.id === selectedId;
			const polyPx = z.poly.map((p) => ({
				x: p[0] * canvas.width,
				y: p[1] * canvas.height,
			}));
			this.drawPoly(
				ctx,
				polyPx,
				zoneColor(z.type),
				false,
				isSelected,
				isSelected ? this.selectedVertexIndex() : null,
			);
		}

		// Draw polygon in progress
		const polyPts = this.polygonPoints();
		if (polyPts.length > 0) {
			for (const pt of polyPts) {
				ctx.fillStyle = '#22d3ee';
				ctx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
			}
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
		selected = false,
		selectedVertexIdx: number | null = null,
	) {
		if (pts.length === 0) return;
		ctx.save();
		ctx.lineWidth = selected ? 4 : 2;
		ctx.strokeStyle = stroke;
		ctx.fillStyle = selected ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0)';
		if (dashed) ctx.setLineDash([6, 4]);
		ctx.beginPath();
		ctx.moveTo(pts[0].x, pts[0].y);
		for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
		ctx.closePath();
		ctx.stroke();
		if (selected) ctx.fill();

		// Draw handles for selected zones
		if (selected) {
			for (let i = 0; i < pts.length; i++) {
				const pt = pts[i];
				ctx.fillStyle = i === selectedVertexIdx ? '#facc15' : '#ffffff';
				ctx.strokeStyle = '#111827';
				ctx.lineWidth = 1.5;
				ctx.fillRect(pt.x - 3, pt.y - 3, 6, 6);
				ctx.strokeRect(pt.x - 3, pt.y - 3, 6, 6);
			}
		}
		ctx.restore();
	}
}

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}

function distSq(a: Pt, b: Pt): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}

function closestPointOnSegment(pt: Pt, a: Pt, b: Pt): Pt {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	if (lenSq <= 1e-9) return a;

	const t = clamp(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq, 0, 1);
	return {
		x: a.x + t * dx,
		y: a.y + t * dy,
	};
}

function zoneColor(type: ZoneType) {
	return type === 'jump' ? '#22d3ee' : '#a855f7';
}
