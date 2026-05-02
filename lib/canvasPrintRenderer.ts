/**
 * Canvas-based Print Renderer
 * Renders photos to canvas with various paper sizes
 *
 * SUPPORTED PAPER SIZES:
 * - 4R (10.2 x 15.2 cm) = 4.02 x 5.98 inches ≈ 4x6 @ 300 DPI = 1206x1794px
 * - A4 (21 x 29.7 cm) = 8.27 x 11.69 inches @ 300 DPI = 2481x3507px
 * - 4x6 (6 x 4 inches) @ 300 DPI = 1800x1200px
 *
 * CRITICAL RULES:
 * - No white space, no empty areas
 * - Image smoothing: HIGH quality
 * - Export: JPEG quality 1.0 (maximum)
 * - Handles both portrait and landscape images
 * - Smart adaptive fit for 4-pose photobooth
 */

export type PaperSize = '4x6' | '4R' | 'A4';

export interface CanvasRenderConfig {
  paperSize?: PaperSize;
  width?: number;
  height?: number;
  quality?: number;
  smoothing?: boolean;
  smoothingQuality?: 'low' | 'medium' | 'high';
}

const PAPER_SIZES: Record<PaperSize, { width: number; height: number; dpi: number }> = {
  '4x6': { width: 1800, height: 1200, dpi: 300 },    // 6x4 inches @ 300 DPI
  '4R': { width: 1206, height: 1794, dpi: 300 },    // 4.02x5.98 inches @ 300 DPI
  'A4': { width: 2481, height: 3507, dpi: 300 },    // 8.27x11.69 inches @ 300 DPI
};

const DEFAULT_CONFIG: CanvasRenderConfig = {
  paperSize: '4x6',
  quality: 1.0,
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

        // COVER MODE: Fill entire canvas, crop if needed
        const canvasAspect = canvasWidth / canvasHeight;
        const imageAspect = img.width / img.height;

        let drawWidth: number;
        let drawHeight: number;
        let drawX: number;
        let drawY: number;

        if (imageAspect > canvasAspect) {
          // Image is wider than canvas - scale by height, crop left/right
          drawHeight = canvasHeight;
          drawWidth = drawHeight * imageAspect;
          drawX = (canvasWidth - drawWidth) / 2;
          drawY = 0;
        } else {
          // Image is taller than canvas - scale by width, crop top/bottom
          drawWidth = canvasWidth;
          drawHeight = drawWidth / imageAspect;
          drawX = 0;
          drawY = (canvasHeight - drawHeight) / 2;
        }

        // Draw image (cover mode)
        // This ensures no white space - image fills entire canvas
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Export to JPEG with MAXIMUM quality
        const base64 = canvas.toDataURL('image/jpeg', finalConfig.quality!);

        console.log(`[CANVAS] ✅ Rendered ${canvasWidth}x${canvasHeight}px (COVER MODE)`);
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

/**
 * Render 4-pose photobooth layout with smart adaptive fit
 * Layout: 2x2 grid (left-top, right-top, left-bottom, right-bottom)
 * Canvas: 1800x1200 (landscape 4x6 @ 300 DPI)
 *
 * SMART FIT SYSTEM:
 * - Portrait: contain + adaptive zoom (safe for face/body)
 * - Landscape: light cover (minimal crop)
 * - All images: centered, no stretch, no excessive zoom
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

  // Render each photo with smart adaptive fit
  for (let i = 0; i < 4; i++) {
    const img = images[i];
    const pos = positions[i];

    // Smart adaptive fit
    const imgAspect = img.width / img.height;
    const frameAspect = photoWidth / photoHeight;

    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > 1.2) {
      // Landscape image: use light cover mode (minimal crop)
      if (imgAspect > frameAspect) {
        drawHeight = photoHeight;
        drawWidth = drawHeight * imgAspect;
        drawX = pos.x - (drawWidth - photoWidth) / 2;
        drawY = pos.y;
      } else {
        drawWidth = photoWidth;
        drawHeight = drawWidth / imgAspect;
        drawX = pos.x;
        drawY = pos.y - (drawHeight - photoHeight) / 2;
      }
    } else {
      // Portrait image: use contain + adaptive zoom (safe for face/body)
      // Adaptive zoom: scale up slightly to fill frame but keep safe margin
      const adaptiveZoom = 1.1; // 10% zoom for better fill
      if (imgAspect > frameAspect) {
        drawHeight = photoHeight * adaptiveZoom;
        drawWidth = drawHeight * imgAspect;
        drawX = pos.x - (drawWidth - photoWidth) / 2;
        drawY = pos.y - (drawHeight - photoHeight) / 2;
      } else {
        drawWidth = photoWidth * adaptiveZoom;
        drawHeight = drawWidth / imgAspect;
        drawX = pos.x - (drawWidth - photoWidth) / 2;
        drawY = pos.y - (drawHeight - photoHeight) / 2;
      }
    }

    // Draw image
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
