import { describe, expect, it } from 'vitest';
import {
	type CoachRecommendationInput,
	recommendSetupChanges,
} from './setup-rules';

describe('recommendSetupChanges', () => {
	it('returns empty results when no symptoms are reported', () => {
		const result = recommendSetupChanges({ reports: [] });

		expect(result.recommendations).toEqual([]);
		expect(result.groups).toEqual([]);
		expect(result.conflicts).toEqual([]);
	});

	it('recommends more front steering for entry understeer', () => {
		const result = recommendSetupChanges({
			reports: [
				{
					symptom: 'understeer',
					phase: 'corner-entry',
					severity: 3,
					sectionId: 'turn-1',
				},
			],
		});

		const ids = result.recommendations.map((rec) => rec.id);
		expect(ids).toContain('front-spring-softer');
		expect(ids).toContain('front-toe-out-increase');
		expect(result.recommendations[0]).toMatchObject({
			id: 'front-spring-softer',
			priority: 'high',
			score: 6,
		});
		expect(result.groups).toEqual([
			expect.objectContaining({
				id: 'increase-steering',
				title: 'Increase rotation and steering',
			}),
		]);
	});

	it('recommends rear stability changes for exit oversteer', () => {
		const result = recommendSetupChanges({
			reports: [
				{
					symptom: 'oversteer',
					phase: 'corner-exit',
					severity: 2,
				},
			],
		});

		expect(result.recommendations).toEqual([
			expect.objectContaining({
				id: 'rear-spring-softer',
				groupId: 'add-rear-stability',
				priority: 'medium',
			}),
		]);
		expect(result.recommendations[0].reasoning).toContain('side bite');
	});

	it('maps poor forward drive to an improve-drive recommendation', () => {
		const result = recommendSetupChanges({
			reports: [
				{
					symptom: 'poor-forward-drive',
					phase: 'corner-exit',
					severity: 2,
				},
			],
		});

		expect(result.recommendations).toEqual([
			expect.objectContaining({
				id: 'rear-spring-softer',
				groupId: 'improve-drive',
				priority: 'medium',
			}),
		]);
		expect(result.recommendations[0].reasoning).toContain('forward drive');
	});

	it('adds high-grip traction roll recommendations from track context', () => {
		const result = recommendSetupChanges({
			trackContext: { grip: 'high' },
			reports: [
				{
					symptom: 'traction-roll',
					phase: 'mid-corner',
					severity: 2,
				},
			],
		});

		const ids = result.recommendations.map((rec) => rec.id);
		expect(ids).toContain('ride-height-lower');
		expect(ids).toContain('front-spring-stiffer');
		expect(result.groups.map((group) => group.id)).toEqual(['control-roll']);
	});

	it('does not apply context-specific rules when context is missing', () => {
		const result = recommendSetupChanges({
			reports: [
				{
					symptom: 'traction-roll',
					phase: 'mid-corner',
					severity: 2,
				},
			],
		});

		expect(result.recommendations.map((rec) => rec.id)).toEqual([
			'ride-height-lower',
		]);
	});

	it('merges duplicate recommendations and retains matched evidence', () => {
		const result = recommendSetupChanges({
			reports: [
				{
					symptom: 'understeer',
					phase: 'corner-entry',
					severity: 2,
					sectionId: 'turn-2',
				},
				{
					symptom: 'lazy-rotation',
					phase: 'corner-entry',
					severity: 1,
					sectionId: 'turn-3',
				},
			],
		});

		const toeRecommendation = result.recommendations.find(
			(rec) => rec.id === 'front-toe-out-increase',
		);

		expect(toeRecommendation).toMatchObject({
			score: 4,
			priority: 'medium',
		});
		expect(toeRecommendation?.matchedReports).toEqual([
			expect.objectContaining({
				ruleId: 'understeer-front-toe',
				sectionId: 'turn-2',
				score: 2,
			}),
			expect.objectContaining({
				ruleId: 'lazy-rotation-front-toe',
				sectionId: 'turn-3',
				score: 2,
			}),
		]);
	});

	it('reports conflicting setup directions while preserving score order', () => {
		const input: CoachRecommendationInput = {
			trackContext: { grip: 'high' },
			reports: [
				{
					symptom: 'understeer',
					phase: 'corner-entry',
					severity: 1,
				},
				{
					symptom: 'traction-roll',
					phase: 'mid-corner',
					severity: 3,
				},
			],
		};

		const result = recommendSetupChanges(input);
		const recommendationIds = result.recommendations.map((rec) => rec.id);

		expect(recommendationIds.indexOf('front-spring-stiffer')).toBeLessThan(
			recommendationIds.indexOf('front-spring-softer'),
		);
		expect(result.conflicts).toEqual([
			{
				setupKey: 'front-spring',
				title: 'Front spring',
				recommendationIds: ['front-spring-stiffer', 'front-spring-softer'],
				message:
					'Front spring has competing recommendations. Start with the highest-priority item and re-test before applying the opposite change.',
			},
		]);
	});

	it('covers bottoming and unstable braking symptoms', () => {
		const result = recommendSetupChanges({
			trackContext: { bumpiness: 'bumpy', features: ['jumps'] },
			reports: [
				{
					symptom: 'bottoming',
					phase: 'landing',
					severity: 2,
				},
				{
					symptom: 'unstable-braking',
					phase: 'braking',
					severity: 2,
				},
			],
		});

		expect(result.recommendations.map((rec) => rec.id)).toEqual([
			'shock-oil-thicker',
			'brake-endpoint-decrease',
			'ride-height-raise',
		]);
		expect(result.groups.map((group) => group.id)).toEqual([
			'landing-support',
			'braking-stability',
		]);
	});
});
