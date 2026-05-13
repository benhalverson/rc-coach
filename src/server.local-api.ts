import { apiApp } from './server.api';
import type { ServerEnv } from './server.env';

export default {
	async fetch(request: Request, env: ServerEnv): Promise<Response> {
		return apiApp.fetch(request, env);
	},
};
