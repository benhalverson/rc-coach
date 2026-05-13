import { Hono } from 'hono';
import {
	registerTrackLibraryRoutes,
	type TrackLibraryHonoEnv,
} from './server/track-library-api';
import { requireDb } from './server.db';
import { MISSING_TRACKS_DB_MESSAGE } from './server.env';

type ApiEnv = TrackLibraryHonoEnv;

export const createApiApp = () => {
	const app = new Hono<ApiEnv>();

	registerTrackLibraryRoutes(app);

	app.use('/api/*', async (c, next) => {
		try {
			c.set('db', requireDb(c.env));
		} catch (error) {
			const message =
				error instanceof Error ? error.message : MISSING_TRACKS_DB_MESSAGE;

			return c.json({ error: message }, 500);
		}

		return next();
	});

	app.get('/api/health', (c) => {
		c.get('db');

		return c.json({ ok: true });
	});

	return app;
};

export const apiApp = createApiApp();
