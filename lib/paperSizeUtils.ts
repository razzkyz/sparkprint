// lib/paperSizeUtils.ts
/**
 * Paper Size Utilities
 * Helper functions for managing paper sizes in the print system
 */

export type PaperSize = "2R" | "4R" | "4x6";

export interface PaperSizeInfo {
  id: PaperSize;
  name: string;
  description: string;
  inches: { width: number; height: number };
  cm: { width: number; height: number };
  pixels: { width: number; height: number }; // @ 300 DPI
  useCase: string;
}

export const PAPER_SIZES: Record<PaperSize, PaperSizeInfo> = {
  "2R": {
    id: "2R",
    name: "2R Strip",
    description: "Photobooth Strip",
    inches: { width: 2, height: 6 },
    cm: { width: 5.08, height: 15.24 },
    pixels: { width: 600, height: 1800 },
    useCase: "Portrait strip for photobooth, carousel, or multi-pose photos",
  },
  "4R": {
    id: "4R",
    name: "4R Standard",
    description: "10×15 cm Landscape",
    inches: { width: 3.94, height: 5.91 },
    cm: { width: 10, height: 15 },
    pixels: { width: 1182, height: 1773 },
    useCase: "Standard landscape format for everyday printing",
  },
  "4x6": {
    id: "4x6",
    name: "4×6 Portrait",
    description: "4×6 inches",
    inches: { width: 4, height: 6 },
    cm: { width: 10.16, height: 15.24 },
    pixels: { width: 1200, height: 1800 },
    useCase: "Default portrait format for wedding, studio, events",
  },
};

/**
 * Get paper size info by ID
 */
export function getPaperSizeInfo(size: PaperSize): PaperSizeInfo {
  return PAPER_SIZES[size];
}

/**
 * Get all available paper sizes
 */
export function getAllPaperSizes(): PaperSizeInfo[] {
  return Object.values(PAPER_SIZES);
}

/**
 * Get dimensions in inches for a paper size
 */
export function getPaperSizeInches(
  size: PaperSize
): { width: number; height: number } {
  return PAPER_SIZES[size].inches;
}

/**
 * Get dimensions in cm for a paper size
 */
export function getPaperSizeCm(
  size: PaperSize
): { width: number; height: number } {
  return PAPER_SIZES[size].cm;
}

/**
 * Get dimensions in pixels @ 300 DPI
 */
export function getPaperSizePixels(
  size: PaperSize
): { width: number; height: number } {
  return PAPER_SIZES[size].pixels;
}

/**
 * Validate paper size
 */
export function isValidPaperSize(value: any): value is PaperSize {
  return value === "2R" || value === "4R" || value === "4x6";
}

/**
 * Get recommended size based on image aspect ratio
 */
export function recommendSize(
  imageWidth: number,
  imageHeight: number
): PaperSize {
  const aspectRatio = imageWidth / imageHeight;

  // Portrait-ish (taller than wide)
  if (aspectRatio < 0.8) {
    return "4x6"; // 4:6 = 0.67
  }

  // Landscape-ish (wider than tall)
  if (aspectRatio > 1.3) {
    return "4R"; // 3.94:5.91 = 0.67
  }

  // Square-ish or mixed
  return "4x6"; // Default
}

/**
 * Format size for display
 */
export function formatSize(size: PaperSize): string {
  const info = PAPER_SIZES[size];
  return `${info.name} (${info.inches.width}"×${info.inches.height}")`;
}

/**
 * Get size label for UI
 */
export function getSizeLabel(size: PaperSize): string {
  return PAPER_SIZES[size].name;
}

/**
 * Get size description
 */
export function getSizeDescription(size: PaperSize): string {
  return PAPER_SIZES[size].description;
}

/**
 * Calculate scaling factor between two sizes
 */
export function getScaleFactor(
  fromSize: PaperSize,
  toSize: PaperSize
): number {
  const fromPixels = PAPER_SIZES[fromSize].pixels;
  const toPixels = PAPER_SIZES[toSize].pixels;

  const fromArea = fromPixels.width * fromPixels.height;
  const toArea = toPixels.width * toPixels.height;

  return toArea / fromArea;
}

/**
 * Check if size is portrait or landscape
 */
export function isPortrait(size: PaperSize): boolean {
  const dims = PAPER_SIZES[size].inches;
  return dims.height > dims.width;
}

/**
 * Check if size is landscape
 */
export function isLandscape(size: PaperSize): boolean {
  const dims = PAPER_SIZES[size].inches;
  return dims.width > dims.height;
}

/**
 * Get orientation name
 */
export function getOrientation(size: PaperSize): "portrait" | "landscape" {
  return isPortrait(size) ? "portrait" : "landscape";
}

/**
 * Get aspect ratio (width / height)
 */
export function getAspectRatio(size: PaperSize): number {
  const dims = PAPER_SIZES[size].inches;
  return dims.width / dims.height;
}

/**
 * Convert size to another unit
 */
export function convertSize(
  size: PaperSize,
  from: "inches" | "cm" | "pixels",
  to: "inches" | "cm" | "pixels"
): { width: number; height: number } {
  const inchesValue = PAPER_SIZES[size].inches;

  let baseValue: { width: number; height: number };
  if (from === "inches") baseValue = inchesValue;
  else if (from === "cm")
    baseValue = { width: inchesValue.width / 2.54, height: inchesValue.height / 2.54 };
  else baseValue = { width: inchesValue.width * 300, height: inchesValue.height * 300 };

  if (to === "inches") return baseValue;
  else if (to === "cm")
    return { width: baseValue.width * 2.54, height: baseValue.height * 2.54 };
  else return { width: baseValue.width * 300, height: baseValue.height * 300 };
}
