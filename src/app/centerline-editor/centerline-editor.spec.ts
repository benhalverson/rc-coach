import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { Vec2 } from '../track-types';
import { CenterlineEditor } from './centerline-editor';

describe('CenterlineEditor', () => {
	let component: CenterlineEditor;
	let fixture: ComponentFixture<CenterlineEditor>;
	let canvas: HTMLCanvasElement;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [CenterlineEditor],
		}).compileComponents();

		fixture = TestBed.createComponent(CenterlineEditor);
		component = fixture.componentInstance;

		const topdown = document.createElement('canvas');
		topdown.width = 100;
		topdown.height = 100;
		fixture.componentRef.setInput('topdown', topdown);
		fixture.componentRef.setInput('lineIn', []);
		fixture.detectChanges();
		await fixture.whenStable();

		canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
		canvas.width = 100;
		canvas.height = 100;
		canvas.getBoundingClientRect = () =>
			({
				left: 0,
				top: 0,
				width: 100,
				height: 100,
				right: 100,
				bottom: 100,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			}) as DOMRect;
		(canvas as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture =
			vi.fn();
		(
			canvas as unknown as { releasePointerCapture: (id: number) => void }
		).releasePointerCapture = vi.fn();
	});

	function pointerAt(x: number, y: number, pointerId = 1): PointerEvent {
		return {
			clientX: x,
			clientY: y,
			pointerId,
			preventDefault: vi.fn(),
		} as unknown as PointerEvent;
	}

	it('snaps new points when enabled and preserves raw pointer placement when disabled', () => {
		const emitted: Vec2[][] = [];
		component.lineOut.subscribe((line) => emitted.push(line));

		component.snapEnabled.set(true);
		component.onPointerDown(pointerAt(13, 17));
		component.snapEnabled.set(false);
		component.onPointerDown(pointerAt(21, 29));

		expect(emitted).toHaveLength(2);
		expect(emitted[0][0][0]).toBeCloseTo(0.16, 4);
		expect(emitted[0][0][1]).toBeCloseTo(0.16, 4);
		expect(emitted[1][1][0]).toBeCloseTo(0.21, 4);
		expect(emitted[1][1][1]).toBeCloseTo(0.29, 4);
	});

	it('supports undo/redo for dragged point edits', () => {
		const emitted: Vec2[][] = [];
		component.lineOut.subscribe((line) => emitted.push(line));
		fixture.componentRef.setInput('lineIn', [
			[0.1, 0.1],
			[0.4, 0.4],
		] satisfies Vec2[]);
		fixture.detectChanges();
		component.snapEnabled.set(false);

		component.onPointerDown(pointerAt(10, 10, 7));
		component.onPointerMove(pointerAt(30, 30, 7));
		component.onPointerUp(pointerAt(30, 30, 7));
		expect(emitted.at(-1)?.[0][0]).toBeCloseTo(0.3, 4);

		component.undoChange();
		expect(emitted.at(-1)?.[0][0]).toBeCloseTo(0.1, 4);
		component.redoChange();
		expect(emitted.at(-1)?.[0][0]).toBeCloseTo(0.3, 4);

		expect(emitted.length).toBeGreaterThanOrEqual(4);
	});

	it('simplify keeps endpoints and smooth preview toggles do not emit line changes', () => {
		const emitted: Vec2[][] = [];
		component.lineOut.subscribe((line) => emitted.push(line));
		fixture.componentRef.setInput('lineIn', [
			[0.1, 0.1],
			[0.2, 0.2],
			[0.3, 0.3],
			[0.9, 0.9],
		] satisfies Vec2[]);
		fixture.detectChanges();

		component.simplifyLine();
		const emittedCountAfterSimplify = emitted.length;
		component.onSmoothPreviewToggle(false);
		component.onSmoothPreviewSamplesChange('20');
		component.onSmoothPreviewToggle(true);

		expect(emitted).toHaveLength(emittedCountAfterSimplify);
		expect(emitted[0]).toHaveLength(2);
		expect(emitted[0][0]).toEqual([0.1, 0.1]);
		expect(emitted[0][1]).toEqual([0.9, 0.9]);
	});
});
