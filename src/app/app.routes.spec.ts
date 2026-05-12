import { routes } from './app.routes';

describe('app routes', () => {
	it('includes a dedicated local-file viewer route', async () => {
		const viewerRoute = routes.find((route) => route.path === 'viewer');

		expect(viewerRoute?.loadComponent).toBeTypeOf('function');

		const component = await viewerRoute?.loadComponent?.();
		expect(component).toBeDefined();
	});
});
