import { TestBed } from '@angular/core/testing';
import type { TrackDef } from '../track-types';
import { TrackStore } from './track-store';

const VALID_TRACK_DEF: TrackDef = {
	id: 'test-id',
	name: 'Test Track',
	widthMeters: 20,
	heightMeters: 12,
	topdownPx: { w: 800, h: 450 },
	zones: [
		{ id: 'z1', type: 'jump', poly: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]] },
	],
	centerline: [[0.1, 0.5], [0.5, 0.5], [0.9, 0.5]],
	import: {
		srcImageName: 'screenshot.png',
		srcQuadPx: [
			{ x: 0, y: 0 },
			{ x: 800, y: 0 },
			{ x: 800, y: 450 },
			{ x: 0, y: 450 },
		],
	},
};

/** Build a fake Event carrying a single File. */
function makeFileEvent(file: File): Event {
	const input = document.createElement('input');
	input.type = 'file';
	// jsdom does not expose DataTransfer, so we mock the files list directly.
	Object.defineProperty(input, 'files', {
		value: {
			0: file,
			length: 1,
			item: (i: number) => (i === 0 ? file : null),
			[Symbol.iterator]: function* () {
				yield file;
			},
		} as unknown as FileList,
		configurable: true,
	});
	return { target: input } as unknown as Event;
}

describe('TrackStore', () => {
	let store: TrackStore;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		store = TestBed.inject(TrackStore);
	});

	it('should be created', () => {
		expect(store).toBeTruthy();
	});

	// ── JSON import ──────────────────────────────────────────────────────────

	it('onImportTrackJsonFile: sets importTrack for valid JSON', async () => {
		const json = JSON.stringify(VALID_TRACK_DEF);
		const file = new File([json], 'track.json', { type: 'application/json' });
		const ev = makeFileEvent(file);

		store.onImportTrackJsonFile(ev);
		// Allow FileReader to complete (microtask + possible macrotask)
		await new Promise((r) => setTimeout(r, 50));

		expect(store.importTrack()).toEqual(VALID_TRACK_DEF);
		expect(store.importJsonError()).toBeNull();
	});

	it('onImportTrackJsonFile: sets importJsonError for malformed JSON', async () => {
		const file = new File(['not-valid-json{{{'], 'track.json', { type: 'application/json' });
		const ev = makeFileEvent(file);

		store.onImportTrackJsonFile(ev);
		await new Promise((r) => setTimeout(r, 50));

		expect(store.importTrack()).toBeNull();
		expect(store.importJsonError()).toMatch(/not valid JSON/i);
	});

	it('onImportTrackJsonFile: sets importJsonError for JSON missing required fields', async () => {
		const partial = { id: 'x', name: 'oops' }; // missing topdownPx, widthMeters, heightMeters
		const file = new File([JSON.stringify(partial)], 'track.json', { type: 'application/json' });
		const ev = makeFileEvent(file);

		store.onImportTrackJsonFile(ev);
		await new Promise((r) => setTimeout(r, 50));

		expect(store.importTrack()).toBeNull();
		expect(store.importJsonError()).toMatch(/missing required fields|must contain/i);
	});

	it('onImportTrackJsonFile: clears previous importJsonError on new attempt', async () => {
		// Set an error first
		const badFile = new File(['{bad'], 'track.json', { type: 'application/json' });
		store.onImportTrackJsonFile(makeFileEvent(badFile));
		await new Promise((r) => setTimeout(r, 50));
		expect(store.importJsonError()).not.toBeNull();

		// Now provide valid JSON
		const goodFile = new File([JSON.stringify(VALID_TRACK_DEF)], 'track.json', {
			type: 'application/json',
		});
		store.onImportTrackJsonFile(makeFileEvent(goodFile));
		await new Promise((r) => setTimeout(r, 50));

		expect(store.importJsonError()).toBeNull();
		expect(store.importTrack()).toEqual(VALID_TRACK_DEF);
	});

	// ── applyImport ───────────────────────────────────────────────────────────

	it('applyImport: restores state from imported track + image', () => {
		// Fake an HTMLImageElement with width/height matching topdownPx
		const fakeImg = { width: 800, height: 450 } as HTMLImageElement;

		store.importTopdownImg.set(fakeImg);
		store.importTrack.set(VALID_TRACK_DEF);

		store.applyImport();

		expect(store.name()).toBe('Test Track');
		expect(store.widthMeters()).toBe(20);
		expect(store.heightMeters()).toBe(12);
		expect(store.zones()).toEqual(VALID_TRACK_DEF.zones);
		expect(store.centerline()).toEqual(VALID_TRACK_DEF.centerline);
		expect(store.srcImageName()).toBe('screenshot.png');
		expect(store.step()).toBe('annotate');
	});

	it('applyImport: trackDef is non-null after import (round-trip)', () => {
		const fakeImg = { width: 800, height: 450 } as HTMLImageElement;

		store.importTopdownImg.set(fakeImg);
		store.importTrack.set(VALID_TRACK_DEF);

		store.applyImport();

		// trackDef must be non-null so re-export is possible
		const def = store.trackDef();
		expect(def).not.toBeNull();
		expect(def?.name).toBe('Test Track');
		expect(def?.widthMeters).toBe(20);
		expect(def?.heightMeters).toBe(12);
		expect(def?.topdownPx.w).toBe(800);
		expect(def?.topdownPx.h).toBe(450);
	});

	it('applyImport: preserves import metadata in re-exported trackDef', () => {
		const fakeImg = { width: 800, height: 450 } as HTMLImageElement;

		store.importTopdownImg.set(fakeImg);
		store.importTrack.set(VALID_TRACK_DEF);

		store.applyImport();

		const def = store.trackDef();
		expect(def?.import?.srcImageName).toBe('screenshot.png');
		expect(def?.import?.srcQuadPx).toEqual(VALID_TRACK_DEF.import?.srcQuadPx);
	});

	it('applyImport: clears importTopdownImg and importTrack signals after apply', () => {
		const fakeImg = { width: 800, height: 450 } as HTMLImageElement;

		store.importTopdownImg.set(fakeImg);
		store.importTrack.set(VALID_TRACK_DEF);

		store.applyImport();

		expect(store.importTopdownImg()).toBeNull();
		expect(store.importTrack()).toBeNull();
	});

	// ── resetAll ─────────────────────────────────────────────────────────────

	it('resetAll: clears importJsonError and importPngError', async () => {
		// Trigger a JSON error
		const file = new File(['{bad'], 'track.json', { type: 'application/json' });
		store.onImportTrackJsonFile(makeFileEvent(file));
		await new Promise((r) => setTimeout(r, 50));
		expect(store.importJsonError()).not.toBeNull();

		store.resetAll();

		expect(store.importJsonError()).toBeNull();
		expect(store.importPngError()).toBeNull();
		expect(store.step()).toBe('upload');
	});

	// ── trackDef guard ────────────────────────────────────────────────────────

	it('trackDef: returns null when topDown is not set', () => {
		expect(store.trackDef()).toBeNull();
	});

	it('trackDef: omits import field when quadPx is null', () => {
		// Set up a minimal topDown canvas (jsdom returns null from getContext,
		// but we can test the signal logic directly)
		const canvas = document.createElement('canvas');
		canvas.width = 400;
		canvas.height = 300;

		store.topDown.set(canvas);
		store.name.set('My Track');
		store.widthMeters.set(15);
		store.heightMeters.set(10);
		// quadPx is null by default

		const def = store.trackDef();
		expect(def).not.toBeNull();
		expect(def?.import).toBeUndefined();
	});
});
