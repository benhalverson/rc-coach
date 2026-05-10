import { TestBed } from '@angular/core/testing';
import { TrackStore } from './track-store';

describe('TrackStore', () => {
	let store: TrackStore;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		store = TestBed.inject(TrackStore);
	});

	it('should be created', () => {
		expect(store).toBeTruthy();
	});

	describe('quadError', () => {
		it('initialises as null', () => {
			expect(store.quadError()).toBeNull();
		});

		it('is cleared by resetAll()', () => {
			store.quadError.set('some warp error');
			store.resetAll();
			expect(store.quadError()).toBeNull();
		});
	});

	describe('importError', () => {
		it('initialises as null', () => {
			expect(store.importError()).toBeNull();
		});

		it('is cleared by resetAll()', () => {
			store.importError.set('import failure');
			store.resetAll();
			expect(store.importError()).toBeNull();
		});

		it('is cleared by applyImport() after a successful import', () => {
			// Set up a valid canvas-based topdown via import signals
			const img = new Image();
			const track = {
				id: 'test',
				name: 'Test Track',
				widthMeters: 20,
				heightMeters: 12,
				topdownPx: { w: 100, h: 100 },
				zones: [],
				centerline: [],
				import: { srcImageName: 'test.png', srcQuadPx: [] },
			} as Parameters<typeof store.importTrack.set>[0];

			store.importTopdownImg.set(img);
			store.importTrack.set(track);
			store.importError.set('stale error');

			store.applyImport();

			expect(store.importError()).toBeNull();
		});
	});

	describe('canGoAnnotateHint', () => {
		it('returns null when canGoAnnotate is true', () => {
			const canvas = document.createElement('canvas');
			canvas.width = 100;
			canvas.height = 100;
			store.topDown.set(canvas);
			store.name.set('My Track');
			store.widthMeters.set(10);
			store.heightMeters.set(8);

			expect(store.canGoAnnotate()).toBe(true);
			expect(store.canGoAnnotateHint()).toBeNull();
		});

		it('mentions missing top-down image when topDown is null', () => {
			store.topDown.set(null);
			store.name.set('My Track');
			store.widthMeters.set(10);
			store.heightMeters.set(8);

			const hint = store.canGoAnnotateHint();
			expect(hint).not.toBeNull();
			expect(hint).toContain('top-down image');
		});

		it('mentions missing track name when name is empty', () => {
			const canvas = document.createElement('canvas');
			canvas.width = 100;
			canvas.height = 100;
			store.topDown.set(canvas);
			store.name.set('');
			store.widthMeters.set(10);
			store.heightMeters.set(8);

			const hint = store.canGoAnnotateHint();
			expect(hint).not.toBeNull();
			expect(hint).toContain('track name');
		});

		it('mentions missing positive width when width is 0', () => {
			const canvas = document.createElement('canvas');
			canvas.width = 100;
			canvas.height = 100;
			store.topDown.set(canvas);
			store.name.set('My Track');
			store.widthMeters.set(0);
			store.heightMeters.set(8);

			const hint = store.canGoAnnotateHint();
			expect(hint).not.toBeNull();
			expect(hint).toContain('positive width');
		});

		it('mentions missing positive height when height is 0', () => {
			const canvas = document.createElement('canvas');
			canvas.width = 100;
			canvas.height = 100;
			store.topDown.set(canvas);
			store.name.set('My Track');
			store.widthMeters.set(10);
			store.heightMeters.set(0);

			const hint = store.canGoAnnotateHint();
			expect(hint).not.toBeNull();
			expect(hint).toContain('positive height');
		});
	});

	describe('resetAll', () => {
		it('resets step to upload and clears all relevant signals', () => {
			const canvas = document.createElement('canvas');
			store.step.set('export');
			store.quadError.set('warp err');
			store.importError.set('import err');
			store.topDown.set(canvas);
			store.measureMode.set(true);

			store.resetAll();

			expect(store.step()).toBe('upload');
			expect(store.quadError()).toBeNull();
			expect(store.importError()).toBeNull();
			expect(store.topDown()).toBeNull();
			expect(store.measureMode()).toBe(false);
		});
	});
});
