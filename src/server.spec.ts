import { createServerHandler } from './server';
import { createApiApp } from './server.api';
import {
	type D1Database,
	MISSING_TRACKS_DB_MESSAGE,
	type ServerEnv,
} from './server.env';

describe('server request handling', () => {
	it('routes API requests through Hono before Angular SSR', async () => {
		const angularHandle = vi.fn().mockResolvedValue(new Response('ssr fallback'));
		const handler = createServerHandler({
			angularApp: { handle: angularHandle },
			apiApp: createApiApp(),
		});

		const response = await handler(new Request('https://example.com/api/health'), {
			TRACKS_DB: {} as D1Database,
		} satisfies Partial<ServerEnv>);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(angularHandle).not.toHaveBeenCalled();
	});

	it('falls back to Angular SSR for non-API routes', async () => {
		const angularResponse = new Response('ssr page');
		const angularHandle = vi.fn().mockResolvedValue(angularResponse);
		const handler = createServerHandler({
			angularApp: { handle: angularHandle },
			apiApp: createApiApp(),
		});

		const response = await handler(new Request('https://example.com/editor'));

		expect(response).toBe(angularResponse);
		expect(angularHandle).toHaveBeenCalledOnce();
	});

	it('returns a server error when the D1 binding is missing', async () => {
		const angularHandle = vi.fn().mockResolvedValue(new Response('ssr fallback'));
		const handler = createServerHandler({
			angularApp: { handle: angularHandle },
			apiApp: createApiApp(),
		});

		const response = await handler(new Request('https://example.com/api/health'));

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: MISSING_TRACKS_DB_MESSAGE,
		});
		expect(angularHandle).not.toHaveBeenCalled();
	});
});
