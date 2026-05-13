import { AngularAppEngine, createRequestHandler } from '@angular/ssr';
import { apiApp } from './server.api';
import type { ServerEnv } from './server.env';

export interface ServerHandlerDependencies {
	angularApp: Pick<AngularAppEngine, 'handle'>;
	apiApp: Pick<typeof apiApp, 'fetch'>;
}

let angularApp: AngularAppEngine | undefined;

const getAngularApp = (): AngularAppEngine => {
	angularApp ??= new AngularAppEngine();

	return angularApp;
};

const isApiRequest = (request: Request): boolean => {
	const { pathname } = new URL(request.url);

	return pathname === '/api' || pathname.startsWith('/api/');
};

export const createServerHandler = (
	dependencies: ServerHandlerDependencies = {
		angularApp: {
			handle: (request) => getAngularApp().handle(request),
		},
		apiApp,
	},
) => {
	return async (
		request: Request,
		env?: Partial<ServerEnv>,
	): Promise<Response> => {
		if (isApiRequest(request)) {
			return dependencies.apiApp.fetch(request, env ?? {});
		}

		const response = await dependencies.angularApp.handle(request);

		return response ?? new Response('Page not found.', { status: 404 });
	};
};

export const handleRequest = createServerHandler();

/**
 * This is a request handler used by the Angular CLI (dev-server and during build).
 */
export const reqHandler = createRequestHandler((req) => handleRequest(req));

export default { fetch: handleRequest };
