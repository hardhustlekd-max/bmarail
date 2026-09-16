import jsQR from 'jsqr';

export interface ScanDetectionResult {
  rawValue: string;
  format?: string;
  source: 'native' | 'jsqr_roi' | 'jsqr_full' | 'image';
  boundingBox?: { x: number; y: number; width: number; height: number; centerX: number; centerY: number };
}

// Check native BarcodeDetector API support
export const isNativeBarcodeDetectorSupported = (): boolean => {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
};

let cachedNativeDetector: any = null;

export const getNativeBarcodeDetector = (): any => {
  if (!isNativeBarcodeDetectorSupported()) return null;
  if (!cachedNativeDetector) {
    try {
      cachedNativeDetector = new (window as any).BarcodeDetector({
        formats: [
          'qr_code',
          'code_128',
          'code_39',
          'ean_13',
          'ean_8',
          'upc_a',
          'upc_e',
          'data_matrix',
          'pdf417',
          'aztec',
        ],
      });
    } catch (e) {
      console.warn('Native BarcodeDetector initialization failed:', e);
      cachedNativeDetector = null;
    }
  }
  return cachedNativeDetector;
};

export interface FastScannerPipeline {
  scanVideoFrame: (video: HTMLVideoElement) => Promise<ScanDetectionResult | null>;
  decodeImage: (img: HTMLImageElement) => Promise<ScanDetectionResult | null>;
  destroy: () => void;
}

/**
 * Creates an ultra-fast, lightweight scanning pipeline optimized for high-resolution video streams.
 * Utilizes hardware-accelerated BarcodeDetector when available with intelligent multi-tier ROI (Region of Interest)
 * downsampled fallback using jsQR.
 */
export const createFastScannerPipeline = (): FastScannerPipeline => {
  // Reusable offscreen canvas elements to eliminate GC pauses
  const roiCanvas = document.createElement('canvas');
  const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });

  const fullCanvas = document.createElement('canvas');
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });

  let isScanningFrame = false;
  let frameCounter = 0;

  const scanVideoFrame = async (video: HTMLVideoElement): Promise<ScanDetectionResult | null> => {
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return null;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;

    if (isScanningFrame) return null;
    isScanningFrame = true;

    try {
      // 1. First Tier: Try native BarcodeDetector if available (hardware-accelerated, runs directly on video)
      const nativeDetector = getNativeBarcodeDetector();
      if (nativeDetector) {
        try {
          const results = await nativeDetector.detect(video);
          if (results && results.length > 0 && results[0]?.rawValue) {
            const bb = results[0].boundingBox;
            let boundingBox;
            if (bb) {
              boundingBox = {
                x: bb.x,
                y: bb.y,
                width: bb.width,
                height: bb.height,
                centerX: bb.x + bb.width / 2,
                centerY: bb.y + bb.height / 2
              };
            }
            return {
              rawValue: results[0].rawValue.trim(),
              format: results[0].format,
              source: 'native',
              boundingBox
            };
          }
        } catch (err) {
          // Native detector can throw if frame drops, seamlessly fall through to jsQR
        }
      }

      // 2. Second Tier: High-Res Stream Viewfinder ROI Crop via jsQR
      // Focusing on the center 50-60% of high-res stream delivers 10x faster processing than scanning full 4K/1080p frame
      if (roiCtx) {
        const cropScale = 0.55; // Center 55% represents the reticle target
        const cropW = Math.round(vw * cropScale);
        const cropH = Math.round(vh * cropScale);
        const cropX = Math.round((vw - cropW) / 2);
        const cropY = Math.round((vh - cropH) / 2);

        // Limit target canvas size for near-instant (<3ms) jsQR analysis
        const maxRoiDim = 480;
        let targetRoiW = cropW;
        let targetRoiH = cropH;
        if (targetRoiW > maxRoiDim || targetRoiH > maxRoiDim) {
          if (targetRoiW > targetRoiH) {
            targetRoiH = Math.round((targetRoiH * maxRoiDim) / targetRoiW);
            targetRoiW = maxRoiDim;
          } else {
            targetRoiW = Math.round((targetRoiW * maxRoiDim) / targetRoiH);
            targetRoiH = maxRoiDim;
          }
        }

        if (roiCanvas.width !== targetRoiW || roiCanvas.height !== targetRoiH) {
          roiCanvas.width = targetRoiW;
          roiCanvas.height = targetRoiH;
        }

        roiCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetRoiW, targetRoiH);
        const roiImgData = roiCtx.getImageData(0, 0, targetRoiW, targetRoiH);
        const roiCode = jsQR(roiImgData.data, targetRoiW, targetRoiH, {
          inversionAttempts: 'dontInvert',
        });

        if (roiCode && roiCode.data && roiCode.data.trim()) {
          const loc = roiCode.location;
          // Scale back from targetRoi to crop to vw/vh
          const scaleX = cropW / targetRoiW;
          const scaleY = cropH / targetRoiH;
          
          const minX = Math.min(loc.topLeft.x, loc.bottomLeft.x);
          const maxX = Math.max(loc.topRight.x, loc.bottomRight.x);
          const minY = Math.min(loc.topLeft.y, loc.topRight.y);
          const maxY = Math.max(loc.bottomLeft.y, loc.bottomRight.y);
          
          const x = cropX + minX * scaleX;
          const y = cropY + minY * scaleY;
          const width = (maxX - minX) * scaleX;
          const height = (maxY - minY) * scaleY;

          return {
            rawValue: roiCode.data.trim(),
            source: 'jsqr_roi',
            boundingBox: {
              x, y, width, height,
              centerX: x + width / 2,
              centerY: y + height / 2
            }
          };
        }
      }

      // 3. Third Tier: Downscaled Full Frame (Run every 2nd frame or when ROI misses)
      frameCounter++;
      if (fullCtx && frameCounter % 2 === 0) {
        const maxFullDim = 640;
        let targetW = vw;
        let targetH = vh;
        if (targetW > maxFullDim || targetH > maxFullDim) {
          if (targetW > targetH) {
            targetH = Math.round((targetH * maxFullDim) / targetW);
            targetW = maxFullDim;
          } else {
            targetW = Math.round((targetW * maxFullDim) / targetH);
            targetH = maxFullDim;
          }
        }

        if (fullCanvas.width !== targetW || fullCanvas.height !== targetH) {
          fullCanvas.width = targetW;
          fullCanvas.height = targetH;
        }

        fullCtx.drawImage(video, 0, 0, targetW, targetH);
        const fullImgData = fullCtx.getImageData(0, 0, targetW, targetH);
        const fullCode = jsQR(fullImgData.data, targetW, targetH, {
          inversionAttempts: 'dontInvert',
        });

        if (fullCode && fullCode.data && fullCode.data.trim()) {
          const loc = fullCode.location;
          const scaleX = vw / targetW;
          const scaleY = vh / targetH;
          
          const minX = Math.min(loc.topLeft.x, loc.bottomLeft.x);
          const maxX = Math.max(loc.topRight.x, loc.bottomRight.x);
          const minY = Math.min(loc.topLeft.y, loc.topRight.y);
          const maxY = Math.max(loc.bottomLeft.y, loc.bottomRight.y);
          
          const x = minX * scaleX;
          const y = minY * scaleY;
          const width = (maxX - minX) * scaleX;
          const height = (maxY - minY) * scaleY;

          return {
            rawValue: fullCode.data.trim(),
            source: 'jsqr_full',
            boundingBox: {
              x, y, width, height,
              centerX: x + width / 2,
              centerY: y + height / 2
            }
          };
        }
      }

      return null;
    } finally {
      isScanningFrame = false;
    }
  };

  const decodeImage = async (img: HTMLImageElement): Promise<ScanDetectionResult | null> => {
    // 1. Native BarcodeDetector API for image
    const nativeDetector = getNativeBarcodeDetector();
    if (nativeDetector) {
      try {
        const results = await nativeDetector.detect(img);
        if (results && results.length > 0 && results[0]?.rawValue) {
          return {
            rawValue: results[0].rawValue.trim(),
            format: results[0].format,
            source: 'native',
          };
        }
      } catch (err) {
        console.warn('Native image detection failed, falling back to multi-scale jsQR:', err);
      }
    }

    // 2. Multi-scale jsQR passes (1200px, 800px, 500px, original)
    const targetScales = [1200, 800, 500, Math.max(img.width, img.height)];
    for (const maxDim of targetScales) {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) continue;

      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, {
        inversionAttempts: 'attemptBoth',
      });
      if (code && code.data && code.data.trim()) {
        return {
          rawValue: code.data.trim(),
          source: 'image',
        };
      }
    }

    return null;
  };

  const destroy = () => {
    roiCanvas.width = 0;
    roiCanvas.height = 0;
    fullCanvas.width = 0;
    fullCanvas.height = 0;
  };

  return {
    scanVideoFrame,
    decodeImage,
    destroy,
  };
};

/**
 * Recommended camera constraints ensuring high resolution for crisp barcode/QR edge detection.
 */
export const getOptimalCameraConstraints = (facingMode: 'environment' | 'user' = 'environment'): MediaStreamConstraints => {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 },
      ...(facingMode === 'environment'
        ? {
            // Request continuous auto focus where supported
            advanced: [{ focusMode: 'continuous' } as any],
          }
        : {}),
    },
  };
};
