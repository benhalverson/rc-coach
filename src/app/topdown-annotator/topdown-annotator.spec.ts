import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { Zone } from '../track-types';
import { TopdownAnnotator } from './topdown-annotator';

describe('TopdownAnnotator', () => {
	let component: TopdownAnnotator;
	let fixture: ComponentFixture<TopdownAnnotator>;

	const makeZone = (id: string): Zone => ({
		id,
		type: 'jump',
		poly: [
			[0.1, 0.1],
			[0.4, 0.1],
			[0.4, 0.4],
			[0.1, 0.4],
		],
	});

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [TopdownAnnotator],
		}).compileComponents();

		fixture = TestBed.createComponent(TopdownAnnotator);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('topdown', document.createElement('canvas'));
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	// ── finishPolygon ──────────────────────────────────────────────────────────

	it('finishPolygon: does not emit when fewer than 3 points', () => {
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));

		component.polygonPoints.set([
			{ x: 10, y: 10 },
			{ x: 50, y: 10 },
		]);
		component.finishPolygon();

		expect(emitted).toHaveLength(0);
		expect(component.polygonPoints()).toHaveLength(2); // unchanged
	});

	it('finishPolygon: emits a new zone and clears polygon points for 3+ points', () => {
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));
		fixture.componentRef.setInput('zonesIn', []);

		component.polygonPoints.set([
			{ x: 10, y: 10 },
			{ x: 50, y: 10 },
			{ x: 30, y: 50 },
		]);
		component.finishPolygon();

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toHaveLength(1);
		expect(emitted[0][0].poly).toHaveLength(3);
		expect(component.polygonPoints()).toHaveLength(0); // cleared
	});

	it('finishPolygon: appends new zone to existing zones', () => {
		const existing = makeZone('existing');
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));
		fixture.componentRef.setInput('zonesIn', [existing]);

		component.polygonPoints.set([
			{ x: 10, y: 10 },
			{ x: 50, y: 10 },
			{ x: 30, y: 50 },
		]);
		component.finishPolygon();

		expect(emitted[0]).toHaveLength(2);
		expect(emitted[0][0].id).toBe('existing');
	});

	// ── cancelPolygon ──────────────────────────────────────────────────────────

	it('cancelPolygon: clears polygon points and preview', () => {
		component.polygonPoints.set([
			{ x: 10, y: 10 },
			{ x: 50, y: 10 },
		]);
		component.cancelPolygon();

		expect(component.polygonPoints()).toHaveLength(0);
	});

	// ── deleteSelected ─────────────────────────────────────────────────────────

	it('deleteSelected: emits zones without the selected zone', () => {
		const z1 = makeZone('z1');
		const z2 = makeZone('z2');
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));
		fixture.componentRef.setInput('zonesIn', [z1, z2]);
		component.selectedZoneId.set('z1');

		component.deleteSelected();

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toHaveLength(1);
		expect(emitted[0][0].id).toBe('z2');
		expect(component.selectedZoneId()).toBeNull();
	});

	it('deleteSelected: does nothing when no zone is selected', () => {
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));
		fixture.componentRef.setInput('zonesIn', [makeZone('z1')]);
		component.selectedZoneId.set(null);

		component.deleteSelected();

		expect(emitted).toHaveLength(0);
	});

	// ── changeSelectedType ─────────────────────────────────────────────────────

	it('changeSelectedType: updates the type of the selected zone', () => {
		const z1: Zone = { id: 'z1', type: 'jump', poly: [[0, 0], [1, 0], [1, 1], [0, 1]] };
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));
		fixture.componentRef.setInput('zonesIn', [z1]);
		component.selectedZoneId.set('z1');

		component.changeSelectedType('wallride');

		expect(emitted).toHaveLength(1);
		expect(emitted[0][0].type).toBe('wallride');
	});

	it('changeSelectedType: does nothing when no zone is selected', () => {
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));
		fixture.componentRef.setInput('zonesIn', [makeZone('z1')]);
		component.selectedZoneId.set(null);

		component.changeSelectedType('wallride');

		expect(emitted).toHaveLength(0);
	});

	// ── undoLast ───────────────────────────────────────────────────────────────

	it('undoLast: emits all zones except the last', () => {
		const z1 = makeZone('z1');
		const z2 = makeZone('z2');
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));
		fixture.componentRef.setInput('zonesIn', [z1, z2]);

		component.undoLast();

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toHaveLength(1);
		expect(emitted[0][0].id).toBe('z1');
	});

	it('undoLast: emits empty array when there is only one zone', () => {
		const emitted: Zone[][] = [];
		component.zonesOut.subscribe((z) => emitted.push(z));
		fixture.componentRef.setInput('zonesIn', [makeZone('z1')]);

		component.undoLast();

		expect(emitted[0]).toHaveLength(0);
	});

	// ── setDrawMode ────────────────────────────────────────────────────────────

	it('setDrawMode: switching to rect clears in-progress polygon points', () => {
		component.drawMode.set('polygon');
		component.polygonPoints.set([
			{ x: 10, y: 10 },
			{ x: 50, y: 10 },
		]);

		component.setDrawMode('rect');

		expect(component.drawMode()).toBe('rect');
		expect(component.polygonPoints()).toHaveLength(0);
	});

	it('setDrawMode: switching to polygon clears in-progress rect drag state', () => {
		component.drawMode.set('rect');
		// Simulate a drag that was started but not finished
		component['dragStart'].set({ x: 10, y: 10 });
		component['preview'].set([{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 10, y: 50 }]);

		component.setDrawMode('polygon');

		expect(component.drawMode()).toBe('polygon');
		expect(component['dragStart']()).toBeNull();
		expect(component['preview']()).toBeNull();
	});

	it('setDrawMode: switching to polygon does not clear anything', () => {
		component.drawMode.set('rect');

		component.setDrawMode('polygon');

		expect(component.drawMode()).toBe('polygon');
	});
});
