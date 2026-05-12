import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { CoachPrototype } from './coach-prototype';

describe('CoachPrototype', () => {
	let component: CoachPrototype;
	let fixture: ComponentFixture<CoachPrototype>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [CoachPrototype],
			providers: [provideRouter([])],
		}).compileComponents();

		fixture = TestBed.createComponent(CoachPrototype);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('creates the coach prototype', () => {
		expect(component).toBeTruthy();
	});

	it('adds and removes symptom reports', () => {
		component.draftSymptom.set('understeer');
		component.draftPhase.set('corner-entry');
		component.draftSeverity.set(3);
		component.draftSectionId.set('Turn 1');
		component.draftNote.set('Pushes before apex');

		component.addReport();
		fixture.detectChanges();

		expect(component.reports()).toEqual([
			{
				symptom: 'understeer',
				phase: 'corner-entry',
				severity: 3,
				sectionId: 'Turn 1',
				note: 'Pushes before apex',
			},
		]);
		expect(text()).toContain('Understeer / push · Corner entry');

		component.removeReport(0);
		fixture.detectChanges();

		expect(component.reports()).toEqual([]);
		expect(text()).toContain('No symptom reports added.');
	});

	it('renders grouped recommendations from added reports', () => {
		component.draftSymptom.set('understeer');
		component.draftPhase.set('corner-entry');
		component.draftSeverity.set(3);
		component.draftSectionId.set('Turn 2');

		component.addReport();
		fixture.detectChanges();
		const turn2Count = text().split('Turn 2').length - 1;

		expect(text()).toContain('Increase rotation and steering');
		expect(text()).toContain('Soften the front spring one step');
		expect(text()).toContain('Add a small amount of front toe-out');
		expect(text()).toContain('Entry and mid-corner understeer');
		expect(turn2Count).toBe(3);
	});

	it('uses track context for context-sensitive recommendations', () => {
		component.draftSymptom.set('traction-roll');
		component.draftPhase.set('mid-corner');
		component.draftSeverity.set(2);

		component.addReport();
		fixture.detectChanges();

		expect(text()).toContain('Lower ride height slightly');
		expect(text()).not.toContain('Stiffen the front spring one step');

		component.clearReports();
		component.grip.set('high');
		component.addReport();
		fixture.detectChanges();

		expect(text()).toContain('Lower ride height slightly');
		expect(text()).toContain('Stiffen the front spring one step');
	});

	it('renders conflict warnings from competing recommendations', () => {
		component.grip.set('high');
		component.draftSymptom.set('understeer');
		component.draftPhase.set('corner-entry');
		component.draftSeverity.set(1);
		component.addReport();

		component.draftSymptom.set('traction-roll');
		component.draftPhase.set('mid-corner');
		component.draftSeverity.set(3);
		component.addReport();
		fixture.detectChanges();

		expect(text()).toContain('Conflicts');
		expect(text()).toContain('Front spring has competing recommendations');
	});

	it('renders an empty state when reports have no matching recommendations', () => {
		component.draftSymptom.set('bottoming');
		component.draftPhase.set('braking');
		component.draftSeverity.set(2);

		component.addReport();
		fixture.detectChanges();

		expect(component.recommendationResult().recommendations).toEqual([]);
		expect(text()).toContain('No setup recommendations match these reports.');
	});

	function text(): string {
		return (fixture.nativeElement as HTMLElement).textContent ?? '';
	}
});
