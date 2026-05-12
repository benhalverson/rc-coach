import { GROUP_TITLES, SETUP_KEY_TITLES, SETUP_RULES } from './setup-rule-data';
import type {
	CoachRecommendation,
	CoachRecommendationInput,
	CoachRecommendationResult,
	RecommendationConflict,
	RecommendationGroup,
	RecommendationMatch,
	RecommendationPriority,
	RuleContext,
	SetupAdjustmentDirection,
	SetupRule,
	SymptomReport,
	SymptomSeverity,
	TrackContext,
} from './setup-types';

export type {
	CoachRecommendation,
	CoachRecommendationInput,
	CoachRecommendationResult,
	DrivingPhase,
	HandlingSymptom,
	RecommendationConflict,
	RecommendationGroup,
	RecommendationGroupId,
	RecommendationMatch,
	RecommendationPriority,
	SetupAdjustmentDirection,
	SetupArea,
	SymptomReport,
	SymptomSeverity,
	TrackBumpiness,
	TrackContext,
	TrackFeature,
	TrackGrip,
	TrackLayout,
} from './setup-types';

/**
 * Score driver symptom reports against the v1 setup rules and return deterministic setup advice.
 *
 * The engine is intentionally pure: it reads only the provided input, keeps no state, and returns
 * the same recommendation result for the same reports and track context.
 */
export function recommendSetupChanges(
	input: CoachRecommendationInput,
): CoachRecommendationResult {
	const byId = new Map<string, CoachRecommendation>();

	for (const report of input.reports) {
		const severity = normalizeSeverity(report.severity);
		for (const rule of SETUP_RULES) {
			if (!ruleMatches(rule, report, input.trackContext)) continue;

			const score = rule.weight * severity;
			const match: RecommendationMatch = {
				ruleId: rule.id,
				symptom: report.symptom,
				phase: report.phase,
				severity,
				sectionId: report.sectionId,
				score,
			};
			const existing = byId.get(rule.recommendation.id);
			if (existing) {
				existing.score += score;
				existing.priority = priorityForScore(existing.score);
				existing.matchedReports.push(match);
			} else {
				byId.set(rule.recommendation.id, {
					...rule.recommendation,
					score,
					priority: priorityForScore(score),
					matchedReports: [match],
				});
			}
		}
	}

	const recommendations = [...byId.values()].sort(compareRecommendations);

	return {
		recommendations,
		groups: groupRecommendations(recommendations),
		conflicts: findConflicts(recommendations),
	};
}

/**
 * Return whether a rule applies to a single symptom report and the optional track context.
 */
function ruleMatches(
	rule: SetupRule,
	report: SymptomReport,
	context: TrackContext | undefined,
): boolean {
	return (
		rule.symptom === report.symptom &&
		rule.phases.includes(report.phase) &&
		contextMatches(rule.context, context)
	);
}

/**
 * Return whether the supplied track context satisfies a rule's optional context gate.
 */
function contextMatches(
	required: RuleContext | undefined,
	context: TrackContext | undefined,
): boolean {
	if (!required) return true;
	if (required.grip && !matchesOneOf(context?.grip, required.grip))
		return false;
	if (
		required.bumpiness &&
		!matchesOneOf(context?.bumpiness, required.bumpiness)
	) {
		return false;
	}
	if (required.layout && !matchesOneOf(context?.layout, required.layout)) {
		return false;
	}
	if (required.features) {
		const features = context?.features ?? [];
		return required.features.some((feature) => features.includes(feature));
	}
	return true;
}

/** Return whether a scalar context value is present in an accepted list. */
function matchesOneOf<T>(value: T | undefined, accepted: T[]): boolean {
	return value != null && accepted.includes(value);
}

/**
 * Build the grouped recommendation view from the globally sorted flat list.
 */
function groupRecommendations(
	recommendations: CoachRecommendation[],
): RecommendationGroup[] {
	const groupIds = new Set(recommendations.map((rec) => rec.groupId));
	return [...groupIds].map((id) => ({
		id,
		title: GROUP_TITLES[id],
		recommendations: recommendations.filter((rec) => rec.groupId === id),
	}));
}

/**
 * Find recommendations that suggest opposite directions for the same setup key.
 */
function findConflicts(
	recommendations: CoachRecommendation[],
): RecommendationConflict[] {
	const bySetupKey = new Map<string, CoachRecommendation[]>();
	for (const recommendation of recommendations) {
		const existing = bySetupKey.get(recommendation.setupKey) ?? [];
		existing.push(recommendation);
		bySetupKey.set(recommendation.setupKey, existing);
	}

	const conflicts: RecommendationConflict[] = [];
	for (const [setupKey, recs] of bySetupKey.entries()) {
		const conflicting = hasDirectionConflict(recs);
		if (!conflicting) continue;

		const title = SETUP_KEY_TITLES[setupKey] ?? setupKey;
		conflicts.push({
			setupKey,
			title,
			recommendationIds: recs.map((rec) => rec.id),
			message: `${title} has competing recommendations. Start with the highest-priority item and re-test before applying the opposite change.`,
		});
	}

	return conflicts.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Return whether the recommendations contain any opposing setup directions.
 */
function hasDirectionConflict(recommendations: CoachRecommendation[]): boolean {
	const directions = new Set(recommendations.map((rec) => rec.direction));
	return (
		hasBoth(directions, 'softer', 'stiffer') ||
		hasBoth(directions, 'increase', 'decrease') ||
		hasBoth(directions, 'raise', 'lower') ||
		hasBoth(directions, 'thicker', 'thinner')
	);
}

/** Return whether a direction set contains both sides of one conflict pair. */
function hasBoth(
	directions: Set<SetupAdjustmentDirection>,
	a: SetupAdjustmentDirection,
	b: SetupAdjustmentDirection,
): boolean {
	return directions.has(a) && directions.has(b);
}

/**
 * Default omitted severity to medium so incomplete survey input remains usable.
 */
function normalizeSeverity(
	severity: SymptomSeverity | undefined,
): SymptomSeverity {
	return severity ?? 2;
}

/**
 * Convert a numeric recommendation score into a display priority bucket.
 */
function priorityForScore(score: number): RecommendationPriority {
	if (score >= 6) return 'high';
	if (score >= 3) return 'medium';
	return 'low';
}

/**
 * Sort recommendations by strength first, then stable human-facing fields.
 */
function compareRecommendations(
	a: CoachRecommendation,
	b: CoachRecommendation,
): number {
	return (
		b.score - a.score ||
		priorityRank(a.priority) - priorityRank(b.priority) ||
		a.title.localeCompare(b.title) ||
		a.id.localeCompare(b.id)
	);
}

/** Return a numeric sort rank for priority labels. */
function priorityRank(priority: RecommendationPriority): number {
	if (priority === 'high') return 0;
	if (priority === 'medium') return 1;
	return 2;
}
