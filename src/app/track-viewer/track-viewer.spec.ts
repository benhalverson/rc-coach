import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TrackStore } from '../state/track-store';
import { TrackViewer } from './track-viewer';

describe('TrackViewer', () => {
	let component: TrackViewer;
	let fixture: ComponentFixture<TrackViewer>;
	let store: TrackStore;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [TrackViewer],
			providers: [provideRouter([])],
		}).compileComponents();

		fixture = TestBed.createComponent(TrackViewer);
		component = fixture.componentInstance;
		store = TestBed.inject(TrackStore);
		fixture.detectChanges();
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('shows an empty-state message before a local export is imported', () => {
		const compiled = fixture.nativeElement as HTMLElement;

		expect(compiled.textContent).toContain(
			'Import a validated export above to render the top-down image, zones, and centerline overlays.',
		);
		expect(
			compiled.querySelector('button[title*="Select both a topdown PNG"]'),
		).toBeTruthy();
	});

	it('renders imported track metadata when viewer state is loaded', () => {
		const canvas = document.createElement('canvas');
		canvas.width = 800;
		canvas.height = 450;
		canvas.toDataURL = () => 'data:image/png;base64,test-viewer';

		store.topDown.set(canvas);
		store.name.set('Viewer Test Track');
		store.widthMeters.set(20);
		store.heightMeters.set(12);
		store.zones.set([
			{
				id: 'zone-1',
				type: 'jump',
				poly: [
					[0.1, 0.1],
					[0.2, 0.1],
					[0.2, 0.2],
				],
			},
		]);
		store.centerline.set([
			[0.1, 0.5],
			[0.5, 0.5],
			[0.9, 0.5],
		]);

		fixture.detectChanges();

		const compiled = fixture.nativeElement as HTMLElement;
		expect(compiled.textContent).toContain('Viewer Test Track');
		expect(compiled.textContent).toContain('20.00m × 12.00m');
		expect(compiled.querySelector('svg')).toBeTruthy();
	});
});
