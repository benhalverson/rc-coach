import type { Routes } from '@angular/router';

export const routes: Routes = [
	{
		path: '',
		loadComponent: () =>
			import('./track-editor/track-editor').then((m) => m.TrackEditor),
	},
	{
		path: 'coach',
		loadComponent: () =>
			import('./coach/coach-prototype').then((m) => m.CoachPrototype),
	},
];
