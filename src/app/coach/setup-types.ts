/**
 * Driver-observed handling problem that the setup coach can reason about.
 * These values are intentionally plain-language so UI controls can map to them directly.
 */
export type HandlingSymptom =
	| 'understeer'
	| 'oversteer'
	| 'traction-roll'
	| 'poor-forward-drive'
	| 'bottoming'
	| 'unstable-braking'
	| 'lazy-rotation';

/**
 * Track or driving phase where a symptom appears.
 * Phase context lets the same symptom produce different setup advice.
 */
export type DrivingPhase =
	| 'braking'
	| 'corner-entry'
	| 'mid-corner'
	| 'corner-exit'
	| 'jump-face'
	| 'landing'
	| 'straight';

/**
 * User-rated symptom strength.
 * Higher severity increases rule score and can promote recommendation priority.
 */
export type SymptomSeverity = 1 | 2 | 3;

/** Coarse track grip level used by context-sensitive rules. */
export type TrackGrip = 'low' | 'medium' | 'high';

/** Coarse surface roughness used by clearance and damping rules. */
export type TrackBumpiness = 'smooth' | 'mixed' | 'bumpy';

/** General layout style for future rules that care about track flow. */
export type TrackLayout = 'tight' | 'mixed' | 'open';

/** Notable track feature that can bias recommendations for a local section. */
export type TrackFeature = 'jumps' | 'wallrides' | 'sweepers' | 'hairpins';

/**
 * Optional track-level context supplied with symptom reports.
 * Rules only use fields they explicitly require.
 */
export type TrackContext = {
	/** Overall surface grip level. */
	grip?: TrackGrip;
	/** Overall surface roughness or bumpiness. */
	bumpiness?: TrackBumpiness;
	/** General layout character. */
	layout?: TrackLayout;
	/** Notable features present on the track. */
	features?: TrackFeature[];
};

/**
 * One observed handling problem from the driver.
 * Reports are the raw evidence that rules match against.
 */
export type SymptomReport = {
	/** What the car is doing wrong. */
	symptom: HandlingSymptom;
	/** Where in the driving sequence the issue appears. */
	phase: DrivingPhase;
	/** Optional strength rating; defaults to medium severity when omitted. */
	severity?: SymptomSeverity;
	/** Optional editor/viewer section id for later track-linked UI. */
	sectionId?: string;
	/** Optional freeform user note; not interpreted by the v1 rules engine. */
	note?: string;
};

/**
 * Complete input payload for the deterministic recommendation engine.
 * The current v1 engine does not require vehicle setup baseline data.
 */
export type CoachRecommendationInput = {
	/** Driver observations to score against the rules table. */
	reports: SymptomReport[];
	/** Optional track context used by context-sensitive rules. */
	trackContext?: TrackContext;
};

/**
 * Human-facing urgency bucket derived from recommendation score.
 * Priority is deterministic and does not depend on display order.
 */
export type RecommendationPriority = 'high' | 'medium' | 'low';

/** Broad vehicle setup subsystem affected by a recommendation. */
export type SetupArea =
	| 'front-suspension'
	| 'rear-suspension'
	| 'drivetrain'
	| 'brakes'
	| 'ride-height';

/**
 * Direction of the suggested setup change.
 * Directions are also used to detect conflicting recommendations on the same setup key.
 */
export type SetupAdjustmentDirection =
	| 'increase'
	| 'decrease'
	| 'softer'
	| 'stiffer'
	| 'raise'
	| 'lower'
	| 'thicker'
	| 'thinner';

/** Stable group bucket used to present related recommendations together. */
export type RecommendationGroupId =
	| 'increase-steering'
	| 'add-rear-stability'
	| 'improve-drive'
	| 'control-roll'
	| 'landing-support'
	| 'braking-stability';

/**
 * Evidence trail showing which report and rule contributed to a recommendation.
 * UI can use this to explain why a recommendation appeared.
 */
export type RecommendationMatch = {
	/** Stable id of the matching setup rule. */
	ruleId: string;
	/** Symptom from the matched report. */
	symptom: HandlingSymptom;
	/** Driving phase from the matched report. */
	phase: DrivingPhase;
	/** Normalized severity used for scoring. */
	severity: SymptomSeverity;
	/** Optional section id carried through from the matched report. */
	sectionId?: string;
	/** Score contribution from this single match. */
	score: number;
};

/**
 * One setup suggestion returned by the coach.
 * Multiple rule matches can merge into a single recommendation when they share an id.
 */
export type CoachRecommendation = {
	/** Stable recommendation id. */
	id: string;
	/** Short human-facing title. */
	title: string;
	/** Setup subsystem affected by this recommendation. */
	area: SetupArea;
	/** Specific setup value being changed, such as front spring or rear diff. */
	setupKey: string;
	/** Direction to move the setup value. */
	direction: SetupAdjustmentDirection;
	/** Presentation group for related recommendations. */
	groupId: RecommendationGroupId;
	/** Priority bucket derived from the final score. */
	priority: RecommendationPriority;
	/** Combined score from every matched rule/report pair. */
	score: number;
	/** Concrete driver/mechanic steps to try. */
	actions: string[];
	/** Explanation of why this change is relevant. */
	reasoning: string;
	/** Rule/report evidence used to create or strengthen this recommendation. */
	matchedReports: RecommendationMatch[];
};

/** Presentation group containing related setup recommendations. */
export type RecommendationGroup = {
	/** Stable group id. */
	id: RecommendationGroupId;
	/** Human-facing group title. */
	title: string;
	/** Recommendations assigned to this group, already sorted by global priority. */
	recommendations: CoachRecommendation[];
};

/**
 * Conflict notice for recommendations that move the same setup key in opposite directions.
 * Conflicts do not remove recommendations; they warn the UI to present them carefully.
 */
export type RecommendationConflict = {
	/** Specific setup value with conflicting directions. */
	setupKey: string;
	/** Human-facing setup value title. */
	title: string;
	/** Recommendation ids involved in the conflict. */
	recommendationIds: string[];
	/** Explanation suitable for display in the coach UI. */
	message: string;
};

/** Full deterministic output from the recommendation engine. */
export type CoachRecommendationResult = {
	/** Flat sorted recommendation list. */
	recommendations: CoachRecommendation[];
	/** Grouped view of the same recommendations. */
	groups: RecommendationGroup[];
	/** Non-blocking conflict notices for competing setup directions. */
	conflicts: RecommendationConflict[];
};

/**
 * Optional context requirement attached to an internal setup rule.
 * Arrays mean "match any of these accepted values".
 */
export type RuleContext = {
	grip?: TrackGrip[];
	bumpiness?: TrackBumpiness[];
	layout?: TrackLayout[];
	features?: TrackFeature[];
};

/**
 * Rule-authored recommendation before scoring and evidence are attached.
 * The engine converts this into a full CoachRecommendation when a rule matches.
 */
export type RecommendationTemplate = Omit<
	CoachRecommendation,
	'priority' | 'score' | 'matchedReports'
>;

/**
 * Internal rule table row.
 * Each rule matches one symptom across one or more phases and emits one recommendation.
 */
export type SetupRule = {
	/** Stable rule id used in recommendation evidence. */
	id: string;
	/** Symptom this rule responds to. */
	symptom: HandlingSymptom;
	/** Driving phases where this rule applies. */
	phases: DrivingPhase[];
	/** Base score multiplier applied to symptom severity. */
	weight: number;
	/** Optional track context gate. */
	context?: RuleContext;
	/** Recommendation emitted when this rule matches. */
	recommendation: RecommendationTemplate;
};
