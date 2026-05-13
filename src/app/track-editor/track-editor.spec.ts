import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Opencv } from '../opencv';
import { TrackApiClient } from '../state/track-api-client';
import { TrackStore } from '../state/track-store';
import { TrackEditor } from './track-editor';

describe('TrackEditor', () => {
	let component: TrackEditor;
	let fixture: ComponentFixture<TrackEditor>;
	let store: TrackStore;
	let saveTrack: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		saveTrack = vi.fn();

		await TestBed.configureTestingModule({
			imports: [TrackEditor],
			providers: [
				provideRouter([]),
				TrackStore,
				{
					provide: Opencv,
					useValue: {
						ready: vi.fn().mockResolvedValue(undefined),
						warpPerspective: vi.fn(),
					},
				},
				{
					provide: TrackApiClient,
					useValue: {
						saveTrack,
					},
				},
			],
		}).compileComponents();

		fixture = TestBed.createComponent(TrackEditor);
		component = fixture.componentInstance;
		store = TestBed.inject(TrackStore);
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('does not send a cloud save request when export is invalid', () => {
		store.step.set('export');
		fixture.detectChanges();

		const saveButton = getButtonByText(fixture, 'Save to cloud');
		expect(saveButton.disabled).toBe(true);

		component.saveToCloud();
		fixture.detectChanges();

		expect(saveTrack).not.toHaveBeenCalled();
		expect(fixture.nativeElement.textContent).toContain(
			'Resolve all export errors before saving to cloud.',
		);
	});

	it('saves a valid export to the cloud and shows confirmation', () => {
		seedValidExportState(store);
		saveTrack.mockReturnValue(
			of({
				id: 'saved-track',
				imageKey: 'tracks/saved-track/topdown.png',
				savedAt: '2024-01-01T00:00:00.000Z',
			}),
		);

		fixture.detectChanges();
		component.saveToCloud();
		fixture.detectChanges();

		expect(saveTrack).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'saved-track',
				name: 'Saved Track',
			}),
			'abc123==',
		);
		expect(store.step()).toBe('export');
		expect(fixture.nativeElement.textContent).toContain(
			'Saved "Saved Track" to cloud as saved-track.',
		);
		expect(getButtonByText(fixture, 'Download topdown.png')).toBeTruthy();
		expect(getButtonByText(fixture, 'Download track.json')).toBeTruthy();
	});

	it('shows actionable API errors when cloud save fails', () => {
		seedValidExportState(store);
		saveTrack.mockReturnValue(
			throwError(() => ({
				status: 400,
				message: 'topdownPngBase64 is required.',
			})),
		);

		fixture.detectChanges();
		component.saveToCloud();
		fixture.detectChanges();

		expect(saveTrack).toHaveBeenCalledOnce();
		expect(fixture.nativeElement.textContent).toContain('Cloud save failed');
		expect(fixture.nativeElement.textContent).toContain(
			'topdownPngBase64 is required.',
		);
	});
});

function seedValidExportState(store: TrackStore) {
	const canvas = document.createElement('canvas');
	canvas.width = 800;
	canvas.height = 450;
	Object.defineProperty(canvas, 'toDataURL', {
		value: vi.fn(() => 'data:image/png;base64,abc123=='),
		configurable: true,
	});

	store.step.set('export');
	store.trackId.set('saved-track');
	store.name.set('Saved Track');
	store.widthMeters.set(20);
	store.heightMeters.set(12);
	store.zones.set([
		{
			id: 'jump-1',
			type: 'jump',
			poly: [
				[0.1, 0.1],
				[0.3, 0.1],
				[0.3, 0.3],
			],
		},
	]);
	store.centerline.set([
		[0.1, 0.5],
		[0.9, 0.5],
	]);
	store.topDown.set(canvas);
}

function getButtonByText(
	fixture: ComponentFixture<TrackEditor>,
	text: string,
): HTMLButtonElement {
	const buttons = Array.from(
		fixture.nativeElement.querySelectorAll('button'),
	) as HTMLButtonElement[];
	const button = buttons.find(
		(candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === text,
	);

	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(`Button not found: ${text}`);
	}

	return button;
}
