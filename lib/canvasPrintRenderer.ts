/**
 * Canvas-based Print Renderer
 * Renders photos to canvas with various paper sizes
 *
 * SUPPORTED PAPER SIZES:
 * - 2R (strip portrait) = 2 x 6 inches @ 300 DPI = 600x1800px
 * - 4R (10 x 15 cm) = 3.94 x 5.91 inches @ 300 DPI = 1182x1773px
 * - 4x6 (6 x 4 inches) @ 300 DPI = 1800x1200px
 *
 * CRITICAL RULES:
 * - Full image without cropping (contain mode)
 * - Image smoothing: HIGH quality
 * - Export: JPEG quality 1.0 (maximum)
 * - Handles both portrait and landscape images
 * - Smart adaptive fit for 4-pose photobooth
 */

export type PaperSize = '2R' | '4R' | '4x6';

export interface CanvasRenderConfig {
  paperSize?: PaperSize;
  width?: number;
  height?: number;
  quality?: number;
  smoothing?: boolean;
  smoothingQuality?: 'low' | 'medium' | 'high';
}

const PAPER_SIZES: Record<PaperSize, { width: number; height: number; dpi: number }> = {
  '2R': { width: 600, height: 1800, dpi: 300 },    // 2x6 inches @ 300 DPI (strip portrait)
  '4R': { width: 1182, height: 1773, dpi: 300 },  // 3.94x5.91 inches @ 300 DPI (10x15cm)
  '4x6': { width: 1800, height: 1200, dpi: 300 }, // 6x4 inches @ 300 DPI
};

const DEFAULT_CONFIG: CanvasRenderConfig = {
  paperSize: '4R',
  quality: 1.0,
  smoothing: true,
  smoothingQuality: 'high',
};

/**
 * Render image to canvas with contain mode (full image, no crop)
 *
 * CONTAIN MODE LOGIC:
 * - Scale image to fit within canvas
 * - No cropping - show full image
 * - Center image with white background if needed
 * - No stretching
 */
export async function renderImageToCanvas(
  imageUrl: string,
  config: CanvasRenderConfig = {}
): Promise<string> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Get dimensions from paper size or custom width/height
  let canvasWidth, canvasHeight;
  if (finalConfig.paperSize && !finalConfig.width) {
    const paper = PAPER_SIZES[finalConfig.paperSize];
    canvasWidth = paper.width;
    canvasHeight = paper.height;
  } else {
    canvasWidth = finalConfig.width || DEFAULT_CONFIG.paperSize ? PAPER_SIZES[DEFAULT_CONFIG.paperSize!].width : 1800;
    canvasHeight = finalConfig.height || DEFAULT_CONFIG.paperSize ? PAPER_SIZES[DEFAULT_CONFIG.paperSize!].height : 1200;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // Create canvas with exact print dimensions
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        // Apply HIGH quality image smoothing
        ctx.imageSmoothingEnabled = finalConfig.smoothing!;
        ctx.imageSmoothingQuality = finalConfig.smoothingQuality!;

        // Fill white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // CONTAIN MODE: Scale to fit, no crop
        const canvasAspect = canvasWidth / canvasHeight;
        const imageAspect = img.width / img.height;

        let drawWidth: number;
        let drawHeight: number;
        let drawX: number;
        let drawY: number;

        if (imageAspect > canvasAspect) {
          // Image is wider than canvas - scale by width
          drawWidth = canvasWidth;
          drawHeight = drawWidth / imageAspect;
          drawX = 0;
          drawY = (canvasHeight - drawHeight) / 2;
        } else {
          // Image is taller than canvas - scale by height
          drawHeight = canvasHeight;
          drawWidth = drawHeight * imageAspect;
          drawX = (canvasWidth - drawWidth) / 2;
          drawY = 0;
        }

        // Draw image (contain mode)
        // Full image visible, centered with white background if needed
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Export to PNG (lossless HD quality for printing)
        const base64 = canvas.toDataURL('image/png');

        console.log(`[CANVAS] ✅ Rendered ${canvasWidth}x${canvasHeight}px (CONTAIN MODE)`);
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
 * Supports: 2R (2x6), 4R (3.94x5.91), 4x6
 */
export function getPrintDimensions(size: PaperSize = '4x6') {
  const dimensionMap: Record<PaperSize, { width: number; height: number; pixelWidth: number; pixelHeight: number }> = {
    '2R': {
      width: 2,
      height: 6,
      pixelWidth: 600,
      pixelHeight: 1800,
    },
    '4R': {
      width: 3.94,
      height: 5.91,
      pixelWidth: 1182,
      pixelHeight: 1773,
    },
    '4x6': {
      width: 4,
      height: 6,
      pixelWidth: 1200,
      pixelHeight: 1800,
    },
  };

  const dims = dimensionMap[size] || dimensionMap['4x6'];
  return {
    ...dims,
    dpi: 300,
  };
}

/**
 * Get QZ Tray print config for DS-RX1
 * CRITICAL: Disable printer scaling - use exact canvas size
 */
export function getQZTrayConfig(printerName: string, size: PaperSize = '4x6') {
  const dims = getPrintDimensions(size);
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

/**
 * Render 4-pose photobooth layout with contain mode
 * Layout: 2x2 grid (left-top, right-top, left-bottom, right-bottom)
 * Canvas: varies by paper size @ 300 DPI
 *
 * CONTAIN MODE:
 * - All images: full image visible, no crop
 * - Centered with white background if needed
 * - No stretch, no excessive zoom
 */
export async function renderPhotobooth4Pose(
  imageUrls: string[],
  config: CanvasRenderConfig = {}
): Promise<string> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (imageUrls.length !== 4) {
    throw new Error('Photobooth requires exactly 4 images');
  }

  // Get dimensions from paper size or custom width/height
  let canvasWidth, canvasHeight;
  if (finalConfig.paperSize && !finalConfig.width) {
    const paper = PAPER_SIZES[finalConfig.paperSize];
    canvasWidth = paper.width;
    canvasHeight = paper.height;
  } else {
    canvasWidth = finalConfig.width || DEFAULT_CONFIG.paperSize ? PAPER_SIZES[DEFAULT_CONFIG.paperSize!].width : 1800;
    canvasHeight = finalConfig.height || DEFAULT_CONFIG.paperSize ? PAPER_SIZES[DEFAULT_CONFIG.paperSize!].height : 1200;
  }

  // Create final canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { alpha: false });

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Apply HIGH quality image smoothing
  ctx.imageSmoothingEnabled = finalConfig.smoothing!;
  ctx.imageSmoothingQuality = finalConfig.smoothingQuality!;

  // Fill white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Layout: 2x2 grid with NO padding (full edge-to-edge)
  const photoWidth = canvasWidth / 2;
  const photoHeight = canvasHeight / 2;

  // Positions for 2x2 grid
  const positions = [
    { x: 0, y: 0 },           // left-top
    { x: photoWidth, y: 0 }, // right-top
    { x: 0, y: photoHeight }, // left-bottom
    { x: photoWidth, y: photoHeight }, // right-bottom
  ];

  // Load and render each image
  const images = await Promise.all(
    imageUrls.map(url => loadImage(url))
  );

  // Render each photo with contain mode (full image, no crop)
  for (let i = 0; i < 4; i++) {
    const img = images[i];
    const pos = positions[i];

    // CONTAIN MODE: Scale to fit within frame, no crop
    const imgAspect = img.width / img.height;
    const frameAspect = photoWidth / photoHeight;

    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > frameAspect) {
      // Image is wider than frame - scale by width
      drawWidth = photoWidth;
      drawHeight = drawWidth / imgAspect;
      drawX = pos.x;
      drawY = pos.y + (photoHeight - drawHeight) / 2;
    } else {
      // Image is taller than frame - scale by height
      drawHeight = photoHeight;
      drawWidth = drawHeight * imgAspect;
      drawX = pos.x + (photoWidth - drawWidth) / 2;
      drawY = pos.y;
    }

    // Draw image (contain mode)
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  }

  // Export to JPEG with MAXIMUM quality
  const base64 = canvas.toDataURL('image/jpeg', finalConfig.quality!);

  console.log(`[PHOTOBOOTH] ✅ Rendered 4-pose layout ${canvasWidth}x${canvasHeight}px`);
  console.log(`[PHOTOBOOTH]   Layout: 2x2 grid with adaptive fit`);
  console.log(`[PHOTOBOOTH]   Quality: ${(finalConfig.quality! * 100).toFixed(0)}%`);

  return base64;
}

/**
 * Load image from URL
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

    img.src = url;
  });
}
