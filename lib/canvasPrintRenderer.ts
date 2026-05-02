/**
 * Canvas-based Print Renderer
 * Renders photos to 1800x1200px canvas (300 DPI @ 6x4 inches)
 * Uses COVER MODE: scale to fill entire canvas, no white space
 * 
 * CRITICAL RULES:
 * - Canvas: 1800 x 1200 pixels (landscape 4x6 format)
 * - No white space, no empty areas
 * - Image smoothing: HIGH quality
 * - Export: JPEG quality 1.0 (maximum)
 * - Handles both portrait and landscape images
 * - Auto center crop if needed
 */

export interface CanvasRenderConfig {
  width?: number;
  height?: number;
  quality?: number;
  smoothing?: boolean;
  smoothingQuality?: 'low' | 'medium' | 'high';
}

const DEFAULT_CONFIG: CanvasRenderConfig = {
  width: 1800,          // 300 DPI * 6 inches
  height: 1200,         // 300 DPI * 4 inches
  quality: 1.0,         // Maximum JPEG quality
  smoothing: true,
  smoothingQuality: 'high',
};

/**
 * Render image to canvas with cover mode (no white space)
 * 
 * COVER MODE LOGIC:
 * - Scale image to fill entire canvas
 * - Auto crop excess parts
 * - Center crop if needed
 * - No stretching, no empty areas
 */
export async function renderImageToCanvas(
  imageUrl: string,
  config: CanvasRenderConfig = {}
): Promise<string> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // Create canvas with exact print dimensions
        const canvas = document.createElement('canvas');
        canvas.width = finalConfig.width!;
        canvas.height = finalConfig.height!;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        // Apply HIGH quality image smoothing
        ctx.imageSmoothingEnabled = finalConfig.smoothing!;
        ctx.imageSmoothingQuality = finalConfig.smoothingQuality!;

        // COVER MODE: Fill entire canvas, crop if needed
        const canvasAspect = finalConfig.width! / finalConfig.height!;
        const imageAspect = img.width / img.height;

        let drawWidth: number;
        let drawHeight: number;
        let drawX: number;
        let drawY: number;

        if (imageAspect > canvasAspect) {
          // Image is wider than canvas - scale by height, crop left/right
          drawHeight = finalConfig.height!;
          drawWidth = drawHeight * imageAspect;
          drawX = (finalConfig.width! - drawWidth) / 2;
          drawY = 0;
        } else {
          // Image is taller than canvas - scale by width, crop top/bottom
          drawWidth = finalConfig.width!;
          drawHeight = drawWidth / imageAspect;
          drawX = 0;
          drawY = (finalConfig.height! - drawHeight) / 2;
        }

        // Draw image (cover mode)
        // This ensures no white space - image fills entire canvas
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Export to JPEG with MAXIMUM quality
        const base64 = canvas.toDataURL('image/jpeg', finalConfig.quality!);

        console.log(`[CANVAS] ✅ Rendered ${finalConfig.width}x${finalConfig.height}px (COVER MODE)`);
        console.log(`[CANVAS]   Original: ${img.width}x${img.height}px`);
        console.log(`[CANVAS]   Scale: ${(drawWidth / img.width * 100).toFixed(1)}%`);
        console.log(`[CANVAS]   Quality: ${(finalConfig.quality! * 100).toFixed(0)}%`);
        console.log(`[CANVAS]   Smoothing: ${finalConfig.smoothingQuality}`);

        resolve(base64);
      } catch (error) {
        console.error('[CANVAS] ❌ Render error:', error);
        reject(error);
      }
    };

    img.onerror = () => {
      const error = new Error(`Failed to load image from URL: ${imageUrl}`);
      console.error('[CANVAS] ❌ Load error:', error);
      reject(error);
    };

    img.src = imageUrl;
  });
}

/**
 * Get print dimensions in inches for DHS RX 1
 * 4x6 inches = 1200x1800 pixels @ 300 DPI (landscape)
 */
export function getPrintDimensions() {
  return {
    width: 6,        // inches
    height: 4,       // inches
    dpi: 300,
    pixelWidth: 1800,
    pixelHeight: 1200,
  };
}

/**
 * Get QZ Tray print config for DS-RX1
 * CRITICAL: Disable printer scaling - use exact canvas size
 */
export function getQZTrayConfig(printerName: string) {
  const dims = getPrintDimensions();
  return {
    size: { width: dims.width, height: dims.height },
    units: 'in',
    density: dims.dpi,
    rasterize: false,              // Don't rasterize - keep vector quality
    scaleContent: false,           // Don't scale - use exact canvas size
    interpolation: 'bicubic',      // Best quality interpolation
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

/**
 * Verify image is ready for printing
 */
export async function verifyImageUrl(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      reject(new Error(`Image verification failed: ${url}`));
    };

    img.src = url;
  });
}
