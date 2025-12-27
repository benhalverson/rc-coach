import { Injectable } from '@angular/core';

declare const cv: any;

@Injectable({ providedIn: 'root' })
export class Opencv {
  private readyP?: Promise<void>;

  ready(): Promise<void> {
    if (this.readyP) return this.readyP;

    this.readyP = new Promise((resolve, reject) => {
      if ((window as any).cv?.Mat) return resolve();

      const s = document.createElement('script');
      s.src = '/assets/opencv/opencv.js';
      s.async = true;
      s.onload = () => {
        (window as any).cv['onRuntimeInitialized'] = () => resolve();
      };
      s.onerror = reject;
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
    const src = cv.imread(img);

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
    const dst = new cv.Mat();
    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(outW, outH),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar()
    );

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    cv.imshow(canvas, dst);

    src.delete(); srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();
    return canvas;
  }
}
