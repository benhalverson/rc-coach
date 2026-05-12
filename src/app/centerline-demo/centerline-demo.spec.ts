import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { TrackStore } from '../state/track-store';
import { CenterlineDemoComponent } from './centerline-demo';

describe('CenterlineDemoComponent', () => {
	let component: CenterlineDemoComponent;
	let fixture: ComponentFixture<CenterlineDemoComponent>;
	let store: TrackStore;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [CenterlineDemoComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(CenterlineDemoComponent);
		component = fixture.componentInstance;
		store = TestBed.inject(TrackStore);
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('centerlineParams is null when centerline is empty', () => {
		store.centerline.set([]);
		fixture.detectChanges();

		expect(component.centerlineParams()).toBeNull();
	});

	it('centerlineParams is null for a single-point centerline', () => {
		store.centerline.set([[0.5, 0.5]]);
		fixture.detectChanges();

		expect(component.centerlineParams()).toBeNull();
	});

	it('centerlineParams is computed for a valid centerline', () => {
		store.centerline.set([
			[0, 0],
			[0.5, 0],
			[1, 0],
		]);
		fixture.detectChanges();

		const params = component.centerlineParams();
		expect(params).not.toBeNull();
		expect(params?.totalLength).toBeGreaterThan(0);
	});

	it('centerlineParams uses derived sampled geometry', () => {
		store.centerline.set([
			[0, 0.5],
			[0.5, 0.1],
			[1, 0.5],
		]);
		fixture.detectChanges();

		const params = component.centerlineParams();

		expect(params).not.toBeNull();
		expect(params?.points.length).toBeGreaterThan(store.centerline().length);
	});

	it('toggleSimulation flips isRunning', () => {
		const initial = component.isRunning();

		component.toggleSimulation();

		expect(component.isRunning()).toBe(!initial);
	});

	it('resetVehicle resets state to origin', () => {
		// Advance the vehicle state first
		component.vehicleState.set({ s: 50, d: 5, psi: 1, v: 2 });
		component.steeringAngle.set(0.3);

		component.resetVehicle();

		const state = component.vehicleState();
		expect(state.s).toBe(0);
		expect(state.d).toBe(0);
		expect(state.psi).toBe(0);
		expect(state.v).toBe(0);
		expect(component.steeringAngle()).toBe(0);
	});
});
