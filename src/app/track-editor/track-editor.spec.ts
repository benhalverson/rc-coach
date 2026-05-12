import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TrackEditor } from './track-editor';

describe('TrackEditor', () => {
	let component: TrackEditor;
	let fixture: ComponentFixture<TrackEditor>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [TrackEditor],
			providers: [provideRouter([])],
		}).compileComponents();

		fixture = TestBed.createComponent(TrackEditor);
		component = fixture.componentInstance;
		await fixture.whenStable();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
