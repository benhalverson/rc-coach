import type { CenterlineParams } from './centerline-params';
import { poseAtArcLength, nearestArcLength } from './centerline-params';

/**
 * Frenet frame (s, d) relative to a parameterized centerline.
 * - s: arc-length along centerline (m when converted).
 * - d: lateral error perpendicular to centerline (+ right, - left).
 */
export interface FrenetPose {
	s: number;
	d: number;
	heading: number; // vehicle heading in world frame
	headingError: number; // δ = ψ - θ(s), yaw error
}

/**
 * Convert world pose (x, y, ψ) to Frenet coordinates (s, d, δ).
 * Finds nearest arc-length s, computes lateral error d and heading error δ.
 * @param params parameterized centerline.
 * @param worldX world x position (normalized or meters).
 * @param worldY world y position (normalized or meters).
 * @param worldHeading vehicle heading (radians, CCW from +x).
 * @returns Frenet pose { s, d, heading, headingError }.
 */
export function worldToFrenet(
	params: CenterlineParams,
	worldX: number,
	worldY: number,
	worldHeading: number,
): FrenetPose {
	const { s, d } = nearestArcLength(params, [worldX, worldY]);
	const { heading: centerlineHeading } = poseAtArcLength(params, s);
	const headingError = worldHeading - centerlineHeading;

	return {
		s,
		d,
		heading: worldHeading,
		headingError: normalizeAngle(headingError),
	};
}

/**
 * Convert Frenet pose (s, d, δ) to world coordinates.
 * @param params parameterized centerline.
 * @param s arc-length (normalized or meters).
 * @param d lateral error (normalized or meters).
 * @param headingError yaw error δ (radians).
 * @returns { x, y, heading } in world frame.
 */
export function frenetToWorld(
	params: CenterlineParams,
	s: number,
	d: number,
	headingError: number,
): { x: number; y: number; heading: number } {
	const { pos, heading: centerlineHeading } = poseAtArcLength(params, s);
	const perpHeading = centerlineHeading + Math.PI / 2;

	// Position: centerline point + lateral offset in perpendicular direction.
	const x = pos[0] + d * Math.cos(perpHeading);
	const y = pos[1] + d * Math.sin(perpHeading);

	// Heading: centerline heading + yaw error.
	const heading = normalizeAngle(centerlineHeading + headingError);

	return { x, y, heading };
}

/**
 * Compute the arc-length rate ds/dt given lateral position and heading.
 * Simplified kinematic model: ds = v * cos(δ) / (1 + κ·d).
 * @param params parameterized centerline.
 * @param s arc-length.
 * @param d lateral error.
 * @param headingError yaw error δ.
 * @param speed forward speed.
 * @returns ds/dt (arc-length rate).
 */
export function arcLengthRate(
	params: CenterlineParams,
	s: number,
	d: number,
	headingError: number,
	speed: number,
): number {
	const { curvature } = poseAtArcLength(params, s);
	const denom = 1 + curvature * d;
	if (Math.abs(denom) < 1e-6) return 0; // Singularity near inflection.
	return (speed * Math.cos(headingError)) / denom;
}

/**
 * Normalize angle to [−π, π].
 */
function normalizeAngle(angle: number): number {
	let a = angle;
	while (a > Math.PI) a -= 2 * Math.PI;
	while (a < -Math.PI) a += 2 * Math.PI;
	return a;
}
