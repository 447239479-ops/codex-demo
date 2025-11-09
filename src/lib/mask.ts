type MorphologyOperation = "dilate" | "erode";

export interface MaskAdjustments {
  feather: number;
  dilate: number;
  erode: number;
}

export interface NormalizedMaskResult {
  imageData: ImageData;
  hasFill: boolean;
}

export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

export function normalizeMaskAdjustments(
  adjustments: MaskAdjustments
): MaskAdjustments {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);

  return {
    feather: clamp(adjustments.feather ?? 0, 0, 20),
    dilate: Math.round(clamp(adjustments.dilate ?? 0, 0, 10)),
    erode: Math.round(clamp(adjustments.erode ?? 0, 0, 10))
  };
}

function ensureMaskColors(imageData: ImageData): ImageData {
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = alpha;
  }
  return imageData;
}

function extractAlpha(imageData: ImageData): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(imageData.width * imageData.height);
  const source = imageData.data;
  for (let index = 0, alphaIndex = 0; index < source.length; index += 4) {
    alpha[alphaIndex++] = source[index + 3];
  }
  return alpha;
}

function alphaToImageData(
  alpha: Uint8ClampedArray,
  width: number,
  height: number
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0, alphaIndex = 0; index < data.length; index += 4) {
    const value = alpha[alphaIndex++];
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = value;
  }
  return new ImageData(data, width, height);
}

function applyMorphology(
  source: ImageData,
  iterations: number,
  operation: MorphologyOperation
): ImageData {
  if (iterations <= 0) {
    return cloneImageData(source);
  }

  const width = source.width;
  const height = source.height;
  let current = extractAlpha(source);
  let next = new Uint8ClampedArray(current.length);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    next.fill(0);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const currentValue = current[index];

        if (operation === "dilate") {
          if (currentValue > 0) {
            next[index] = 255;
            continue;
          }

          let shouldActivate = false;
          for (let offsetY = -1; offsetY <= 1 && !shouldActivate; offsetY += 1) {
            const neighborY = y + offsetY;
            if (neighborY < 0 || neighborY >= height) {
              continue;
            }
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              const neighborX = x + offsetX;
              if (neighborX < 0 || neighborX >= width) {
                continue;
              }
              const neighborIndex = neighborY * width + neighborX;
              if (current[neighborIndex] > 0) {
                shouldActivate = true;
                break;
              }
            }
          }

          next[index] = shouldActivate ? 255 : 0;
        } else {
          if (currentValue === 0) {
            next[index] = 0;
            continue;
          }

          let shouldKeep = true;
          for (let offsetY = -1; offsetY <= 1 && shouldKeep; offsetY += 1) {
            const neighborY = y + offsetY;
            if (neighborY < 0 || neighborY >= height) {
              continue;
            }
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              const neighborX = x + offsetX;
              if (neighborX < 0 || neighborX >= width) {
                continue;
              }
              const neighborIndex = neighborY * width + neighborX;
              if (current[neighborIndex] === 0) {
                shouldKeep = false;
                break;
              }
            }
          }

          next[index] = shouldKeep ? 255 : 0;
        }
      }
    }

    const swap = current;
    current = next;
    next = swap;
  }

  return alphaToImageData(current, width, height);
}

function applyFeather(source: ImageData, radius: number): ImageData {
  if (radius <= 0) {
    return cloneImageData(source);
  }

  const width = source.width;
  const height = source.height;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempContext = tempCanvas.getContext("2d");
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = width;
  targetCanvas.height = height;
  const targetContext = targetCanvas.getContext("2d");

  if (!tempContext || !targetContext) {
    return cloneImageData(source);
  }

  tempContext.putImageData(source, 0, 0);
  targetContext.filter = `blur(${radius}px)`;
  targetContext.drawImage(tempCanvas, 0, 0);

  return ensureMaskColors(targetContext.getImageData(0, 0, width, height));
}

export function applyMaskAdjustments(
  base: ImageData,
  adjustments: MaskAdjustments
): ImageData {
  const normalized = normalizeMaskAdjustments(adjustments);
  let working = cloneImageData(base);

  if (normalized.dilate > 0) {
    working = applyMorphology(working, normalized.dilate, "dilate");
  }

  if (normalized.erode > 0) {
    working = applyMorphology(working, normalized.erode, "erode");
  }

  if (normalized.feather > 0) {
    working = applyFeather(working, normalized.feather);
  }

  return ensureMaskColors(working);
}

export function normalizeMaskCanvas(
  canvas: HTMLCanvasElement,
  threshold = 127
): NormalizedMaskResult | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const processed = normalizeMaskImageData(imageData, threshold);
  context.putImageData(processed.imageData, 0, 0);

  return {
    imageData: cloneImageData(processed.imageData),
    hasFill: processed.hasFill
  };
}

export function normalizeMaskImageData(
  imageData: ImageData,
  threshold = 127
): NormalizedMaskResult {
  const data = imageData.data;
  let hasFill = false;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] > threshold ? 255 : 0;
    if (alpha > 0) {
      hasFill = true;
    }
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = alpha;
  }

  return {
    imageData,
    hasFill
  };
}
