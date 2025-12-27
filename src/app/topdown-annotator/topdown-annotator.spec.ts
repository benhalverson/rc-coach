import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { TopdownAnnotator } from './topdown-annotator';

describe('TopdownAnnotator', () => {
	let component: TopdownAnnotator;
	let fixture: ComponentFixture<TopdownAnnotator>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [TopdownAnnotator],
		}).compileComponents();

		fixture = TestBed.createComponent(TopdownAnnotator);
		component = fixture.componentInstance;
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
