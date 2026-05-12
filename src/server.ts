import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import {
	handleTrackLibraryRequest,
	type TrackLibraryEnv,
} from './server/track-library-api';

const angularApp = new AngularAppEngine();

async function handleRequest(request: Request, env?: TrackLibraryEnv) {
	const apiResponse = await handleTrackLibraryRequest(request, env);
	if (apiResponse) {
		return apiResponse;
	}

	const appResponse = await angularApp.handle(request);
	return appResponse ?? new Response('Page not found.', { status: 404 });
}

/**
 * This is a request handler used by the Angular CLI (dev-server and during build).
 */
export const reqHandler = createRequestHandler((req) => handleRequest(req));

export default {
	fetch(request: Request, env: TrackLibraryEnv) {
		return handleRequest(request, env);
	},
};
