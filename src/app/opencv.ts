import { Injectable } from '@angular/core';

type MatLike = { delete(): void };

interface CVModule {
  Mat: new (...args: unknown[]) => MatLike;
  imread(img: HTMLImageElement): MatLike;
  matFromArray(...args: unknown[]): MatLike;
  getPerspectiveTransform(a: unknown, b: unknown): MatLike;
  cvtColor(src: MatLike, dst: MatLike, code: unknown): void;
  warpPerspective(
    src: MatLike,
    dst: MatLike,
    M: MatLike,
    size: unknown,
    inter: unknown,
    border: unknown,
    scalar: unknown
  ): void;
  Size: new (w: number, h: number) => unknown;
  INTER_LINEAR: unknown;
  BORDER_CONSTANT: unknown;
  CV_32FC2: unknown;
  COLOR_RGBA2RGB: unknown;
  Scalar: new (...args: unknown[]) => unknown;
  imshow(canvas: HTMLCanvasElement, mat: MatLike): void;
  locateFile?: (file: string) => string;
  onRuntimeInitialized?: () => void;
}

declare const cv: CVModule;

@Injectable({ providedIn: 'root' })
export class Opencv {
  private readyP?: Promise<void>;

  ready(): Promise<void> {
    if (this.readyP) return this.readyP;

    this.readyP = new Promise((resolve, reject) => {
      // SSR guard: only load in browser
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return resolve();
      }
      const w = window as unknown as { cv?: CVModule };
      if (w.cv?.Mat) return resolve();

      const s = document.createElement('script');
      s.src = '/assets/opencv/opencv.js';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => {
        const mod = (window as unknown as { cv?: CVModule }).cv;
        if (!mod) return reject(new Error('OpenCV module not found after script load'));
        // Ensure wasm resolves next to JS file
        mod.locateFile = (file: string) => `/assets/opencv/${file}`;
        mod.onRuntimeInitialized = () => resolve();
      };
      s.onerror = () => reject(new Error('Failed to load /assets/opencv/opencv.js'));
      document.body.appendChild(s);
    });

    return this.readyP;
  }

  warpPerspective(
    img: HTMLImageElement,
    srcQuadPx: { x: number; y: number }[], // TL,TR,BR,BL
    outW: number,
    outH: number
  ): HTMLCanvasElement {
    // Validate quad: check for collinearity or inverted corners
    const isValid = this.isValidQuad(srcQuadPx);
    if (!isValid) {
      console.warn('Invalid quad detected (collinear or inverted), using fallback', srcQuadPx);
      // Return a blank canvas; caller will detect and use fallback
      const c = document.createElement('canvas');
      c.width = outW;
      c.height = outH;
      return c;
    }

    // Read and convert to 3-channel RGB to avoid dark RGBA warps
    const srcRgba = cv.imread(img);
    const src = new cv.Mat();
    cv.cvtColor(srcRgba, src, cv.COLOR_RGBA2RGB);

    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      srcQuadPx[0].x, srcQuadPx[0].y,
      srcQuadPx[1].x, srcQuadPx[1].y,
      srcQuadPx[2].x, srcQuadPx[2].y,
      srcQuadPx[3].x, srcQuadPx[3].y,
    ]);

    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outW, 0,
      outW, outH,
      0, outH,
    ]);

    const M = cv.getPerspectiveTransform(srcPts, dstPts);
    const dst = new cv.Mat(outH, outW, (src as unknown as { type(): unknown }).type());
    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(outW, outH),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0)
    );

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    cv.imshow(canvas, dst);

    srcRgba.delete(); src.delete(); srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();
    return canvas;
  }

  private isValidQuad(pts: { x: number; y: number }[]): boolean {
    if (pts.length !== 4) return false;
    // Check for duplicate points
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        if (Math.hypot(dx, dy) < 10) return false; // too close
      }
    }
    // Check cross product to detect self-intersecting quads (rough check)
    const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const signs = [
      Math.sign(cross(pts[0], pts[1], pts[2])),
      Math.sign(cross(pts[1], pts[2], pts[3])),
      Math.sign(cross(pts[2], pts[3], pts[0])),
      Math.sign(cross(pts[3], pts[0], pts[1])),
    ];
    // All same sign = valid convex quad
    const allSame = signs.every(s => s === signs[0]);
    return allSame;
  }
}
