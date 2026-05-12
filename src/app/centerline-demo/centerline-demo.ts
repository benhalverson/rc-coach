import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	signal,
	viewChild,
} from '@angular/core';
import {
	parameterizeCenterline,
	poseAtArcLength,
} from '../geometry/centerline-params';
import { arcLengthRate } from '../geometry/frenet';
import { extractTrackLimits } from '../geometry/track-limits';
import { TrackStore } from '../state/track-store';
import type { Zone } from '../track-types';

/**
 * Vehicle state for kinematic model.
 */
interface VehicleState {
	s: number;
	d: number;
	psi: number;
	v: number;
}

/**
 * Centerline demo: kinematic follower visualization.
 * - Renders topdown image with centerline (red) and zones (cyan).
 * - Displays a vehicle (blue circle) following the centerline.
 * - Shows real-time gauges: s, d, ψ, v, δ.
 * - Accepts steering input (left/right arrow keys or slider).
 */
@Component({
	selector: 'app-centerline-demo',
	imports: [],
	templateUrl: './centerline-demo.html',
	styleUrl: './centerline-demo.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CenterlineDemoComponent {
	private store = inject(TrackStore);
	private canvas = viewChild<{ nativeElement: HTMLCanvasElement }>(
		'demoCanvas',
	);

	// Derived from track store
	centerlineParams = computed(() => {
		const centerline =
			this.store.derivedCenterline()?.sampledPoints ?? this.store.centerline();
		if (!centerline || centerline.length < 2) return null;
		return parameterizeCenterline(centerline);
	});

	trackLimits = computed(() => {
		const params = this.centerlineParams();
		const zones = this.store.zones();
		if (!params) return null;
		return extractTrackLimits(params, zones, 100);
	});

	// Canvas properties
	canvasWidth = signal(640);
	canvasHeight = signal(480);

	// Vehicle state and controls
	vehicleState = signal<VehicleState>({
		s: 0,
		d: 0,
		psi: 0,
		v: 0,
	});

	steeringAngle = signal(0); // δ in radians
	speed = signal(2); // m/s
	isRunning = signal(true);
	private lastFrameTime = 0;
	private animFrameId: number | null = null;
	private keydownHandler: ((ev: KeyboardEvent) => void) | null = null;

	constructor() {
		// Set up animation loop with proper cleanup
		effect(
			() => {
				const canvasRef = this.canvas();
				if (!canvasRef) return;

				const canvas = canvasRef.nativeElement;

				const animate = () => {
					if (this.isRunning()) {
						this.updateVehicle();
						this.render(canvas);
					}
					this.animFrameId = requestAnimationFrame(animate);
				};

				this.animFrameId = requestAnimationFrame(animate);

				return () => {
					if (this.animFrameId !== null) {
						cancelAnimationFrame(this.animFrameId);
						this.animFrameId = null;
					}
				};
			},
			{ allowSignalWrites: true },
		);

		// Set up keyboard controls with proper cleanup
		effect(
			() => {
				if (this.keydownHandler) {
					window.removeEventListener('keydown', this.keydownHandler);
				}

				this.keydownHandler = (ev: KeyboardEvent) => {
					const step = 0.05;
					if (ev.key === 'ArrowLeft') {
						this.steeringAngle.update((s) => Math.max(-0.5, s - step));
					} else if (ev.key === 'ArrowRight') {
						this.steeringAngle.update((s) => Math.min(0.5, s + step));
					}
				};

				window.addEventListener('keydown', this.keydownHandler);

				return () => {
					if (this.keydownHandler) {
						window.removeEventListener('keydown', this.keydownHandler);
						this.keydownHandler = null;
					}
				};
			},
			{ allowSignalWrites: true },
		);
	}

	private updateVehicle(): void {
		const now = performance.now() / 1000; // seconds
		const dt = this.lastFrameTime ? now - this.lastFrameTime : 0.016; // ~60 Hz
		this.lastFrameTime = now;

		const params = this.centerlineParams();
		if (!params) return;

		const state = this.vehicleState();
		const v = this.speed();
		const delta = this.steeringAngle();

		// Simple kinematic model: ds/dt = s_dot(params, s, d, δ, v)
		const sRate = arcLengthRate(params, state.s, state.d, delta, v);
		const newS = state.s + sRate * dt;

		// Clamp to [0, totalLength]
		const clampedS = Math.max(0, Math.min(newS, params.totalLength));

		// Update lateral dynamics: d_dot ≈ v * sin(δ) (simple approximation)
		const lateralVel = v * Math.sin(delta);
		const newD = state.d + lateralVel * dt;

		// Use the local centerline tangent as the vehicle nose direction.
		const { heading } = poseAtArcLength(params, clampedS);

		this.vehicleState.set({
			s: clampedS,
			d: newD,
			psi: heading,
			v: v,
		});
	}

	private render(canvas: HTMLCanvasElement): void {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const params = this.centerlineParams();
		const srcImage = this.store.srcImage();
		const zones = this.store.zones();
		const topDown = this.store.topDown();

		// Clear canvas
		ctx.fillStyle = 'white';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Draw image if available
		if (topDown instanceof HTMLCanvasElement) {
			ctx.drawImage(topDown, 0, 0, canvas.width, canvas.height);
		} else if (srcImage instanceof HTMLImageElement) {
			ctx.drawImage(srcImage, 0, 0, canvas.width, canvas.height);
		}

		if (!params) {
			// Show message if no centerline
			ctx.fillStyle = 'red';
			ctx.font = '16px Arial';
			ctx.fillText('No centerline available. Draw one first.', 20, 40);
			return;
		}

		// Normalized [0,1] coords → canvas pixels.
		const scaleX = canvas.width;
		const scaleY = canvas.height;

		// Draw centerline in red
		ctx.strokeStyle = 'red';
		ctx.lineWidth = 2;
		ctx.beginPath();
		params.arcLengths.forEach((s, i) => {
			const pose = poseAtArcLength(params, s);
			const px = pose.pos[0] * scaleX;
			const py = pose.pos[1] * scaleY;
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		});
		ctx.stroke();

		// Draw zones (cyan outlines)
		ctx.strokeStyle = 'cyan';
		ctx.lineWidth = 1;
		ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
		zones.forEach((zone: Zone) => {
			ctx.beginPath();
			zone.poly.forEach((pt: [number, number], i: number) => {
				const px = pt[0] * scaleX;
				const py = pt[1] * scaleY;
				if (i === 0) ctx.moveTo(px, py);
				else ctx.lineTo(px, py);
			});
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
		});

		// Draw vehicle marker and nose direction.
		const state = this.vehicleState();
		const pose = poseAtArcLength(params, state.s);
		const vehicleX = pose.pos[0] * scaleX;
		const vehicleY = pose.pos[1] * scaleY;
		const heading = pose.heading;
		const vehicleRadius = 10;

		ctx.fillStyle = '#2563eb';
		ctx.strokeStyle = '#93c5fd';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(vehicleX, vehicleY, vehicleRadius, 0, 2 * Math.PI);
		ctx.fill();
		ctx.stroke();

		ctx.strokeStyle = '#60a5fa';
		ctx.lineWidth = 4;
		ctx.lineCap = 'round';
		ctx.beginPath();
		const headingLen = 26;
		ctx.moveTo(
			vehicleX + vehicleRadius * 0.35 * Math.cos(heading),
			vehicleY + vehicleRadius * 0.35 * Math.sin(heading),
		);
		ctx.lineTo(
			vehicleX + headingLen * Math.cos(heading),
			vehicleY + headingLen * Math.sin(heading),
		);
		ctx.stroke();
		ctx.lineCap = 'butt';
	}

	toggleSimulation(): void {
		this.isRunning.update((v) => !v);
	}

	resetVehicle(): void {
		const params = this.centerlineParams();
		const heading = params ? poseAtArcLength(params, 0).heading : 0;

		this.vehicleState.set({
			s: 0,
			d: 0,
			psi: heading,
			v: 0,
		});
		this.steeringAngle.set(0);
		this.lastFrameTime = 0;
	}
}
