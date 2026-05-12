import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
	type CoachRecommendationInput,
	type DrivingPhase,
	type HandlingSymptom,
	type RecommendationPriority,
	recommendSetupChanges,
	type SymptomReport,
	type SymptomSeverity,
	type TrackBumpiness,
	type TrackContext,
	type TrackFeature,
	type TrackGrip,
	type TrackLayout,
} from './setup-rules';

type Option<T extends string | number> = {
	value: T;
	label: string;
};

const SYMPTOM_OPTIONS: Option<HandlingSymptom>[] = [
	{ value: 'understeer', label: 'Understeer / push' },
	{ value: 'oversteer', label: 'Oversteer / loose' },
	{ value: 'traction-roll', label: 'Traction roll' },
	{ value: 'poor-forward-drive', label: 'Poor forward drive' },
	{ value: 'bottoming', label: 'Bottoming' },
	{ value: 'unstable-braking', label: 'Unstable braking' },
	{ value: 'lazy-rotation', label: 'Lazy rotation' },
];

const PHASE_OPTIONS: Option<DrivingPhase>[] = [
	{ value: 'braking', label: 'Braking' },
	{ value: 'corner-entry', label: 'Corner entry' },
	{ value: 'mid-corner', label: 'Mid-corner' },
	{ value: 'corner-exit', label: 'Corner exit' },
	{ value: 'jump-face', label: 'Jump face' },
	{ value: 'landing', label: 'Landing' },
	{ value: 'straight', label: 'Straight' },
];

const SEVERITY_OPTIONS: Option<SymptomSeverity>[] = [
	{ value: 1, label: 'Mild' },
	{ value: 2, label: 'Medium' },
	{ value: 3, label: 'Strong' },
];

const GRIP_OPTIONS: Option<TrackGrip>[] = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
];

const BUMPINESS_OPTIONS: Option<TrackBumpiness>[] = [
	{ value: 'smooth', label: 'Smooth' },
	{ value: 'mixed', label: 'Mixed' },
	{ value: 'bumpy', label: 'Bumpy' },
];

const LAYOUT_OPTIONS: Option<TrackLayout>[] = [
	{ value: 'tight', label: 'Tight' },
	{ value: 'mixed', label: 'Mixed' },
	{ value: 'open', label: 'Open' },
];

const FEATURE_OPTIONS: Option<TrackFeature>[] = [
	{ value: 'jumps', label: 'Jumps' },
	{ value: 'wallrides', label: 'Wallrides' },
	{ value: 'sweepers', label: 'Sweepers' },
	{ value: 'hairpins', label: 'Hairpins' },
];

@Component({
	selector: 'app-coach-prototype',
	imports: [CommonModule, RouterLink],
	templateUrl: './coach-prototype.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoachPrototype {
	readonly symptomOptions = SYMPTOM_OPTIONS;
	readonly phaseOptions = PHASE_OPTIONS;
	readonly severityOptions = SEVERITY_OPTIONS;
	readonly gripOptions = GRIP_OPTIONS;
	readonly bumpinessOptions = BUMPINESS_OPTIONS;
	readonly layoutOptions = LAYOUT_OPTIONS;
	readonly featureOptions = FEATURE_OPTIONS;

	readonly draftSymptom = signal<HandlingSymptom>('understeer');
	readonly draftPhase = signal<DrivingPhase>('corner-entry');
	readonly draftSeverity = signal<SymptomSeverity>(2);
	readonly draftSectionId = signal('');
	readonly draftNote = signal('');

	readonly grip = signal<TrackGrip | ''>('');
	readonly bumpiness = signal<TrackBumpiness | ''>('');
	readonly layout = signal<TrackLayout | ''>('');
	readonly features = signal<TrackFeature[]>([]);
	readonly reports = signal<SymptomReport[]>([]);

	readonly trackContext = computed((): TrackContext | undefined => {
		const context: TrackContext = {};
		if (this.grip()) context.grip = this.grip() as TrackGrip;
		if (this.bumpiness())
			context.bumpiness = this.bumpiness() as TrackBumpiness;
		if (this.layout()) context.layout = this.layout() as TrackLayout;
		if (this.features().length) context.features = this.features();

		return Object.keys(context).length ? context : undefined;
	});

	readonly recommendationInput = computed(
		(): CoachRecommendationInput => ({
			reports: this.reports(),
			trackContext: this.trackContext(),
		}),
	);

	readonly recommendationResult = computed(() =>
		recommendSetupChanges(this.recommendationInput()),
	);

	setDraftSymptom(value: string) {
		this.draftSymptom.set(value as HandlingSymptom);
	}

	setDraftPhase(value: string) {
		this.draftPhase.set(value as DrivingPhase);
	}

	setDraftSeverity(value: string) {
		const severity = Number(value);
		if (severity === 1 || severity === 2 || severity === 3) {
			this.draftSeverity.set(severity);
		}
	}

	setGrip(value: string) {
		this.grip.set(value ? (value as TrackGrip) : '');
	}

	setBumpiness(value: string) {
		this.bumpiness.set(value ? (value as TrackBumpiness) : '');
	}

	setLayout(value: string) {
		this.layout.set(value ? (value as TrackLayout) : '');
	}

	addReport() {
		const sectionId = this.draftSectionId().trim();
		const note = this.draftNote().trim();

		const report: SymptomReport = {
			symptom: this.draftSymptom(),
			phase: this.draftPhase(),
			severity: this.draftSeverity(),
			sectionId: sectionId || undefined,
			note: note || undefined,
		};

		this.reports.update((reports) => [...reports, report]);
		this.draftSectionId.set('');
		this.draftNote.set('');
	}

	removeReport(index: number) {
		this.reports.update((reports) => reports.filter((_, i) => i !== index));
	}

	clearReports() {
		this.reports.set([]);
	}

	toggleFeature(feature: TrackFeature, checked: boolean) {
		this.features.update((features) => {
			if (checked) {
				return features.includes(feature) ? features : [...features, feature];
			}
			return features.filter((item) => item !== feature);
		});
	}

	hasFeature(feature: TrackFeature): boolean {
		return this.features().includes(feature);
	}

	labelForSymptom(symptom: HandlingSymptom): string {
		return labelFor(SYMPTOM_OPTIONS, symptom);
	}

	labelForPhase(phase: DrivingPhase): string {
		return labelFor(PHASE_OPTIONS, phase);
	}

	labelForSeverity(severity: SymptomSeverity): string {
		return labelFor(SEVERITY_OPTIONS, severity);
	}

	labelForFeature(feature: TrackFeature): string {
		return labelFor(FEATURE_OPTIONS, feature);
	}

	priorityClasses(priority: RecommendationPriority): string {
		if (priority === 'high') {
			return 'border-red-500/60 bg-red-950/30 text-red-200';
		}
		if (priority === 'medium') {
			return 'border-amber-500/60 bg-amber-950/30 text-amber-200';
		}
		return 'border-cyan-500/60 bg-cyan-950/30 text-cyan-200';
	}
}

function labelFor<T extends string | number>(
	options: Option<T>[],
	value: T,
): string {
	return (
		options.find((option) => option.value === value)?.label ?? String(value)
	);
}
