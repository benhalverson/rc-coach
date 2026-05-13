import {
	HttpClient,
	HttpErrorResponse,
	HttpParams,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import type { TrackDef } from '../track-types';

export type TrackListItem = {
	id: string;
	name: string;
	widthMeters: number;
	heightMeters: number;
	topdownPx: { w: number; h: number };
	createdAt: string;
	updatedAt: string;
	imageUrl: string;
};

export type TrackListResponse = {
	items: TrackListItem[];
	page: number;
	pageSize: number;
};

export type TrackGetResponse = {
	track: TrackDef;
	createdAt: string;
	updatedAt: string;
	imageUrl: string;
};

export type TrackSaveResponse = {
	id: string;
	imageKey: string;
	savedAt: string;
};

/** Structured error surfaced by all `TrackApiClient` methods. */
export type TrackApiError = {
	status: number;
	message: string;
};

@Injectable({ providedIn: 'root' })
export class TrackApiClient {
	private readonly http = inject(HttpClient);

	/** Lists saved tracks from the cloud library (metadata only). */
	listTracks(page = 1, pageSize = 25): Observable<TrackListResponse> {
		const params = new HttpParams()
			.set('page', String(page))
			.set('pageSize', String(pageSize));

		return this.http
			.get<TrackListResponse>('/api/tracks', { params })
			.pipe(catchError(handleError));
	}

	/**
	 * Saves or updates a track and its top-down PNG in the cloud library.
	 * @param track - Validated TrackDef to store.
	 * @param topdownPngBase64 - Base64-encoded PNG image matching `track.topdownPx`.
	 */
	saveTrack(
		track: TrackDef,
		topdownPngBase64: string,
	): Observable<TrackSaveResponse> {
		return this.http
			.post<TrackSaveResponse>('/api/tracks', { track, topdownPngBase64 })
			.pipe(catchError(handleError));
	}

	/** Fetches the full track payload for a single saved track. */
	getTrack(id: string): Observable<TrackGetResponse> {
		return this.http
			.get<TrackGetResponse>(`/api/tracks/${encodeURIComponent(id)}`)
			.pipe(catchError(handleError));
	}

	/**
	 * Fetches the top-down PNG for a saved track as a Blob.
	 * API failures are surfaced as a `TrackApiError`.
	 */
	getTrackImage(id: string): Observable<Blob> {
		return this.http
			.get(`/api/tracks/${encodeURIComponent(id)}/topdown.png`, {
				responseType: 'blob',
			})
			.pipe(catchError(handleError));
	}

	/**
	 * Returns the URL for a saved track's top-down PNG.
	 * Use directly in an `<img src="...">` — no HTTP request is made.
	 */
	getTrackImageUrl(id: string): string {
		return `/api/tracks/${encodeURIComponent(id)}/topdown.png`;
	}
}

function handleError(error: unknown): Observable<never> {
	const apiError: TrackApiError = {
		status: 0,
		message: 'An unexpected error occurred.',
	};

	if (error instanceof HttpErrorResponse) {
		apiError.status = error.status;
		const body: unknown = error.error;
		if (
			body !== null &&
			typeof body === 'object' &&
			'error' in body &&
			typeof (body as Record<string, unknown>)['error'] === 'string'
		) {
			apiError.message = (body as Record<string, unknown>)['error'] as string;
		} else {
			apiError.message = error.message;
		}
	}

	return throwError(() => apiError);
}
