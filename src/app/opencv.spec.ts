import { TestBed } from '@angular/core/testing';

import { Opencv } from './opencv';

describe('Opencv', () => {
	let service: Opencv;

	beforeEach(() => {
		TestBed.configureTestingModule({});
		service = TestBed.inject(Opencv);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	describe('ready()', () => {
		it('rejects when script fails to load', async () => {
			// Simulate onerror by patching appendChild to fire onerror immediately
			const origAppend = document.body.appendChild.bind(document.body);
			vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
				const el = node as HTMLScriptElement;
				if (el.tagName === 'SCRIPT') {
					setTimeout(() => el.onerror?.(new Event('error')), 0);
				}
				return origAppend(node);
			});

			await expect(service.ready()).rejects.toThrow(
				'Failed to load /assets/opencv/opencv.js',
			);
		});

		it('resolves immediately when cv.Mat is already available', async () => {
			// Simulate cv already initialized
			const win = window as unknown as { cv?: { Mat: unknown } };
			win.cv = { Mat: class {} };

			try {
				await expect(service.ready()).resolves.toBeUndefined();
			} finally {
				delete win.cv;
			}
		});
	});
});
