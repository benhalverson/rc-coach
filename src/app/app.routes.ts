import type { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./track-editor/track-editor').then((m) => m.TrackEditor),
	},
];
