import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { QuadPicker } from './quad-picker';

describe('QuadPicker', () => {
	let component: QuadPicker;
	let fixture: ComponentFixture<QuadPicker>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [QuadPicker],
		}).compileComponents();

		fixture = TestBed.createComponent(QuadPicker);
		component = fixture.componentInstance;
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
