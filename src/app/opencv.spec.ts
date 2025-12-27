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
});
