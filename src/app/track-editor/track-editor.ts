import { CommonModule, JsonPipe } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	signal,
	viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CenterlineDemoComponent } from '../centerline-demo/centerline-demo';
import { CenterlineEditor } from '../centerline-editor/centerline-editor';
import { type Pt } from '../geometry/geometry';
import { QuadPicker } from '../quad-picker/quad-picker';
import {
	TrackApiClient,
	type TrackApiError,
	type TrackListItem,
} from '../state/track-api-client';
import { type Step, TrackStore } from '../state/track-store';
import { TopdownAnnotator } from '../topdown-annotator/topdown-annotator';
import type { Vec2, ZoneType } from '../track-types';

@Component({
	selector: 'app-track-editor',
	imports: [
		JsonPipe,
		QuadPicker,
		CommonModule,
		TopdownAnnotator,
		CenterlineEditor,
		CenterlineDemoComponent,
		RouterLink,
	],
	templateUrl: './track-editor.html',
	styleUrl: './track-editor.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrackEditor {
	private readonly annotator = viewChild<TopdownAnnotator>('annotator');
	private readonly destroyRef = inject(DestroyRef);
	private readonly trackApiClient = inject(TrackApiClient);
	private readonly store = inject(TrackStore);

	readonly STEPS: { id: Step; label: string }[] = [
		{ id: 'upload', label: '1. Upload' },
		{ id: 'quad', label: '2. Quad' },
		{ id: 'scale', label: '3. Scale' },
		{ id: 'annotate', label: '4. Annotate' },
		{ id: 'centerline', label: '5. Centerline' },
		{ id: 'export', label: '6. Export' },
	];

	// Proxies to TrackStore signals/computed
	readonly step = this.store.step;
	readonly srcImage = this.store.srcImage;
	readonly srcImageName = this.store.srcImageName;
	readonly quadPx = this.store.quadPx;
	readonly quadError = this.store.quadError;
	readonly topDown = this.store.topDown;
	readonly topDownDataUrl = this.store.topDownDataUrl;
	readonly topDownW = this.store.topDownW;
	readonly topDownH = this.store.topDownH;
	readonly name = this.store.name;
	readonly widthMeters = this.store.widthMeters;
	readonly heightMeters = this.store.heightMeters;
	readonly zones = this.store.zones;
	readonly centerline = this.store.centerline;
	readonly centerlinePointsSvg = this.store.centerlinePointsSvg;
	readonly derivedCenterline = this.store.derivedCenterline;
	readonly derivedCenterlinePointsSvg = this.store.derivedCenterlinePointsSvg;
	readonly measureMode = this.store.measureMode;
	readonly measurePt1 = this.store.measurePt1;
	readonly measurePt2 = this.store.measurePt2;
	readonly measurePixelDist = this.store.measurePixelDist;
	readonly measureRealDist = this.store.measureRealDist;
	readonly pixelsPerMeter = this.store.pixelsPerMeter;
	readonly canGoAnnotate = this.store.canGoAnnotate;
	readonly warpError = this.store.warpError;
	readonly canGoAnnotateHint = this.store.canGoAnnotateHint;
	readonly scaleErrors = this.store.scaleErrors;
	readonly scaleValid = this.store.scaleValid;
	readonly trackDef = this.store.trackDef;
	readonly exportErrors = this.store.exportErrors;
	readonly exportWarnings = this.store.exportWarnings;
	readonly exportValid = this.store.exportValid;
	readonly saveInFlight = signal(false);
	readonly saveError = signal<string | null>(null);
	readonly saveSuccess = signal<{ id: string; name: string } | null>(null);

	// Import proxies
	readonly importTopdownImg = this.store.importTopdownImg;
	readonly importTrack = this.store.importTrack;
	readonly canImport = this.store.canImport;
	readonly pixelsPerMeterAuto = this.store.pixelsPerMeterAuto;
	readonly importJsonError = this.store.importJsonError;
	readonly importWarnings = this.store.importWarnings;
	readonly importPngError = this.store.importPngError;
	readonly importCompatibilityError = this.store.importCompatibilityError;
	readonly showTrackLibrary = signal(false);
	readonly trackLibraryLoading = signal(false);
	readonly trackLibraryItems = signal<TrackListItem[]>([]);
	readonly trackLibraryError = signal<string | null>(null);
	readonly openingTrackId = signal<string | null>(null);

	onFile(ev: Event) {
		this.store.onFile(ev);
	}

	onQuad(rawPts: Pt[]) {
		this.store.onQuad(rawPts);
	}

	// Fallback helpers now live in TrackStore

	resetAll() {
		this.store.resetAll();
	}

	onMeasureCanvasClick(ev: MouseEvent, canvas: HTMLCanvasElement) {
		this.store.onMeasureCanvasClick(ev, canvas);
	}

	applyMeasure() {
		this.store.applyMeasure();
	}

	cancelMeasure() {
		this.store.cancelMeasure();
	}

	downloadTopdownPng() {
		this.store.downloadTopdownPng();
	}

	downloadTrackJson() {
		this.store.downloadTrackJson();
	}

	saveToCloud() {
		if (this.saveInFlight()) return;

		this.saveError.set(null);
		this.saveSuccess.set(null);

		const track = this.trackDef();
		if (!this.exportValid() || !track) {
			this.saveError.set('Resolve all export errors before saving to cloud.');
			return;
		}

		const topdownPngBase64 = this.getTopdownPngBase64();
		if (!topdownPngBase64) {
			this.saveError.set('Top-down PNG is not available for upload.');
			return;
		}

		this.saveInFlight.set(true);
		this.trackApiClient
			.saveTrack(track, topdownPngBase64)
			.pipe(finalize(() => this.saveInFlight.set(false)))
			.subscribe({
				next: (response) => {
					this.saveSuccess.set({ id: response.id, name: track.name });
				},
				error: (error: TrackApiError) => {
					this.saveError.set(error.message);
				},
			});
	}

	selectZone(id: string) {
		const ann = this.annotator();
		if (ann) {
			ann.selectedZoneId.set(id);
		}
	}

	deleteZone(id: string) {
		this.zones.update((zs) => zs.filter((z) => z.id !== id));
	}

	countZonesByType(type: ZoneType): number {
		return this.store.countZonesByType(type);
	}

	onCenterlineChange(line: Vec2[]) {
		this.store.onCenterlineChange(line);
	}

	onImportTopdownFile(ev: Event) {
		this.store.onImportTopdownFile(ev);
	}

	onImportTrackJsonFile(ev: Event) {
		this.store.onImportTrackJsonFile(ev);
	}

	applyImport() {
		this.store.applyImport();
	}

	toggleTrackLibrary() {
		const next = !this.showTrackLibrary();
		this.showTrackLibrary.set(next);
		if (next) {
			this.refreshTrackLibrary();
		}
	}

	refreshTrackLibrary() {
		this.trackLibraryLoading.set(true);
		this.trackLibraryError.set(null);

		this.trackApiClient
			.listTracks()
			.pipe(
				takeUntilDestroyed(this.destroyRef),
				finalize(() => this.trackLibraryLoading.set(false)),
			)
			.subscribe({
				next: (response) => {
					this.trackLibraryItems.set(response.items);
				},
				error: (error: TrackApiError) => {
					this.trackLibraryItems.set([]);
					this.trackLibraryError.set(this.getTrackApiErrorMessage(error));
				},
			});
	}

	openSavedTrack(id: string) {
		if (this.openingTrackId()) {
			return;
		}

		this.openingTrackId.set(id);
		this.trackLibraryError.set(null);

		this.trackApiClient
			.getTrack(id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: async (response) => {
					try {
						const image = await this.loadImage(
							this.trackApiClient.getTrackImageUrl(response.track.id),
						);
						this.importTrack.set(response.track);
						this.importTopdownImg.set(image);
						this.applyImport();
					} catch (error) {
						this.trackLibraryError.set(this.getTrackApiErrorMessage(error));
					} finally {
						this.openingTrackId.set(null);
					}
				},
				error: (error: TrackApiError) => {
					this.trackLibraryError.set(this.getTrackApiErrorMessage(error));
					this.openingTrackId.set(null);
				},
			});
	}

	private loadImage(url: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () =>
				reject(new Error('Failed to load the saved track image.'));
			image.src = url;
		});
	}

	private getTrackApiErrorMessage(error: unknown): string {
		if (hasErrorMessage(error)) {
			return error.message;
		}

		return 'Unable to load saved tracks right now.';
	}

	private getTopdownPngBase64(): string | null {
		const dataUrl =
			this.topDownDataUrl() ?? this.topDown()?.toDataURL('image/png') ?? null;

		return dataUrl ? extractPngBase64(dataUrl) : null;
	}
}
// Using store-provided signals; no local Step type needed.

function extractPngBase64(dataUrl: string): string | null {
	const prefix = 'data:image/png;base64,';
	return dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : null;
}

function hasErrorMessage(error: unknown): error is { message: string } {
	return (
		error !== null &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string'
	);
}
