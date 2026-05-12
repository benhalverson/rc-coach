import type { RecommendationGroupId, SetupRule } from './setup-types';

/** Human-facing titles for recommendation group buckets. */
export const GROUP_TITLES: Record<RecommendationGroupId, string> = {
	'increase-steering': 'Increase rotation and steering',
	'add-rear-stability': 'Add rear stability',
	'improve-drive': 'Improve forward drive',
	'control-roll': 'Control traction roll',
	'landing-support': 'Add jump and landing support',
	'braking-stability': 'Improve braking stability',
};

/** Human-facing names for setup keys used in conflict messages. */
export const SETUP_KEY_TITLES: Record<string, string> = {
	'front-spring': 'Front spring',
	'front-toe': 'Front toe',
	'rear-diff': 'Rear differential',
	'rear-toe': 'Rear toe-in',
	'rear-spring': 'Rear spring',
	'ride-height': 'Ride height',
	'shock-oil': 'Shock oil',
	'brake-endpoint': 'Brake endpoint',
};

/**
 * Deterministic v1 setup rule table.
 * Rules are data-only so the engine can stay small and future recommendations can be reviewed in one place.
 */
export const SETUP_RULES: SetupRule[] = [
	{
		id: 'understeer-front-spring',
		symptom: 'understeer',
		phases: ['corner-entry', 'mid-corner'],
		weight: 2,
		recommendation: {
			id: 'front-spring-softer',
			title: 'Soften the front spring one step',
			area: 'front-suspension',
			setupKey: 'front-spring',
			direction: 'softer',
			groupId: 'increase-steering',
			actions: [
				'Try the next softer front spring.',
				'Re-test entry and mid-corner steering before changing rear grip.',
			],
			reasoning:
				'Entry and mid-corner understeer often means the front tires are not loading enough to rotate the car.',
		},
	},
	{
		id: 'understeer-front-toe',
		symptom: 'understeer',
		phases: ['corner-entry'],
		weight: 1,
		recommendation: {
			id: 'front-toe-out-increase',
			title: 'Add a small amount of front toe-out',
			area: 'front-suspension',
			setupKey: 'front-toe',
			direction: 'increase',
			groupId: 'increase-steering',
			actions: [
				'Increase front toe-out by a small step.',
				'Watch that straight-line stability does not get nervous.',
			],
			reasoning:
				'More front toe-out can make the car respond sooner at corner entry.',
		},
	},
	{
		id: 'understeer-exit-rear-diff',
		symptom: 'understeer',
		phases: ['corner-exit'],
		weight: 2,
		recommendation: {
			id: 'rear-diff-thinner',
			title: 'Try slightly thinner rear diff oil',
			area: 'drivetrain',
			setupKey: 'rear-diff',
			direction: 'thinner',
			groupId: 'increase-steering',
			actions: [
				'Drop rear diff oil one step.',
				'Compare on-power rotation at corner exit.',
			],
			reasoning:
				'On-power push can come from the rear diff keeping the car too locked as throttle is applied.',
		},
	},
	{
		id: 'oversteer-entry-rear-toe',
		symptom: 'oversteer',
		phases: ['braking', 'corner-entry'],
		weight: 2,
		recommendation: {
			id: 'rear-toe-increase',
			title: 'Add rear toe-in one step',
			area: 'rear-suspension',
			setupKey: 'rear-toe',
			direction: 'increase',
			groupId: 'add-rear-stability',
			actions: [
				'Increase rear toe-in by the smallest available step.',
				'Check whether entry rotation is calmer without losing too much steering.',
			],
			reasoning:
				'Rear toe-in helps stabilize the car when it is loose under braking or initial turn-in.',
		},
	},
	{
		id: 'oversteer-rear-spring',
		symptom: 'oversteer',
		phases: ['mid-corner', 'corner-exit'],
		weight: 2,
		recommendation: {
			id: 'rear-spring-softer',
			title: 'Soften the rear spring one step',
			area: 'rear-suspension',
			setupKey: 'rear-spring',
			direction: 'softer',
			groupId: 'add-rear-stability',
			actions: [
				'Try the next softer rear spring.',
				'Re-test mid-corner balance and exit drive together.',
			],
			reasoning:
				'Softening the rear can add side bite when the car is loose through the corner or on exit.',
		},
	},
	{
		id: 'poor-drive-rear-spring',
		symptom: 'poor-forward-drive',
		phases: ['corner-exit'],
		weight: 2,
		recommendation: {
			id: 'rear-spring-softer',
			title: 'Soften the rear spring one step',
			area: 'rear-suspension',
			setupKey: 'rear-spring',
			direction: 'softer',
			groupId: 'improve-drive',
			actions: [
				'Try the next softer rear spring.',
				'Re-test throttle pickup from the same corner exit.',
			],
			reasoning:
				'Poor forward drive on exit usually points to the rear tires needing more load consistency.',
		},
	},
	{
		id: 'traction-roll-lower-ride-height',
		symptom: 'traction-roll',
		phases: ['corner-entry', 'mid-corner', 'corner-exit'],
		weight: 2,
		recommendation: {
			id: 'ride-height-lower',
			title: 'Lower ride height slightly',
			area: 'ride-height',
			setupKey: 'ride-height',
			direction: 'lower',
			groupId: 'control-roll',
			actions: [
				'Lower the car a small amount at both ends.',
				'Keep enough clearance for jumps and bumps.',
			],
			reasoning:
				'Lowering the center of gravity is a direct way to reduce traction rolling.',
		},
	},
	{
		id: 'traction-roll-high-grip-front-spring',
		symptom: 'traction-roll',
		phases: ['corner-entry', 'mid-corner', 'corner-exit'],
		weight: 2,
		context: { grip: ['high'] },
		recommendation: {
			id: 'front-spring-stiffer',
			title: 'Stiffen the front spring one step',
			area: 'front-suspension',
			setupKey: 'front-spring',
			direction: 'stiffer',
			groupId: 'control-roll',
			actions: [
				'Try the next stiffer front spring.',
				'Confirm the car still turns consistently on lower-grip sections.',
			],
			reasoning:
				'On high-grip tracks, reducing front chassis roll can calm traction rolling.',
		},
	},
	{
		id: 'bottoming-shock-oil',
		symptom: 'bottoming',
		phases: ['jump-face', 'landing'],
		weight: 2,
		recommendation: {
			id: 'shock-oil-thicker',
			title: 'Increase shock oil thickness one step',
			area: 'front-suspension',
			setupKey: 'shock-oil',
			direction: 'thicker',
			groupId: 'landing-support',
			actions: [
				'Move to the next thicker shock oil.',
				'Check that the car still settles quickly after landing.',
			],
			reasoning:
				'Bottoming on jump faces or landings means the suspension needs more damping support.',
		},
	},
	{
		id: 'bottoming-bumpy-ride-height',
		symptom: 'bottoming',
		phases: ['landing', 'straight'],
		weight: 1,
		context: { bumpiness: ['bumpy'] },
		recommendation: {
			id: 'ride-height-raise',
			title: 'Raise ride height slightly',
			area: 'ride-height',
			setupKey: 'ride-height',
			direction: 'raise',
			groupId: 'landing-support',
			actions: [
				'Raise ride height a small amount.',
				'Re-check corner speed because extra height can add roll.',
			],
			reasoning:
				'Bumpy tracks can need extra clearance even when the rest of the setup is balanced.',
		},
	},
	{
		id: 'unstable-braking-endpoint',
		symptom: 'unstable-braking',
		phases: ['braking', 'corner-entry'],
		weight: 2,
		recommendation: {
			id: 'brake-endpoint-decrease',
			title: 'Reduce brake endpoint slightly',
			area: 'brakes',
			setupKey: 'brake-endpoint',
			direction: 'decrease',
			groupId: 'braking-stability',
			actions: [
				'Reduce brake endpoint or brake strength a small step.',
				'Retest the same braking zone before changing suspension.',
			],
			reasoning:
				'If the car is unstable while braking, too much brake force can overload the rear tires before turn-in.',
		},
	},
	{
		id: 'lazy-rotation-front-toe',
		symptom: 'lazy-rotation',
		phases: ['corner-entry', 'mid-corner'],
		weight: 2,
		recommendation: {
			id: 'front-toe-out-increase',
			title: 'Add a small amount of front toe-out',
			area: 'front-suspension',
			setupKey: 'front-toe',
			direction: 'increase',
			groupId: 'increase-steering',
			actions: [
				'Increase front toe-out by a small step.',
				'Watch that straight-line stability does not get nervous.',
			],
			reasoning:
				'More front toe-out can help the car take an initial set sooner.',
		},
	},
];
