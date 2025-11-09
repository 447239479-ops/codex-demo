const EXIF_MARKER = 0xffe1;

const ORIENTATION_TAG = 0x0112;

type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

async function readArrayBufferPart(file: File, length: number): Promise<ArrayBuffer> {
  const blob = file.slice(0, length);
  return blob.arrayBuffer();
}

export async function readImageOrientation(file: File): Promise<Orientation> {
  const type = file.type.toLowerCase();
  if (!type.includes("jpeg") && !type.includes("jpg")) {
    return 1;
  }

  const buffer = await readArrayBufferPart(file, 128 * 1024);
  const view = new DataView(buffer);
  if (view.getUint16(0, false) !== 0xffd8) {
    return 1;
  }

  let offset = 2;
  const length = view.byteLength;

  while (offset < length) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === EXIF_MARKER) {
      const size = view.getUint16(offset, false);
      offset += 2;
      const exifHeader = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );

      if (exifHeader !== "Exif") {
        break;
      }

      offset += 6;
      const tiffOffset = offset;
      const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
      const firstIFDOffset = view.getUint32(tiffOffset + 4, littleEndian);
      let dirOffset = tiffOffset + firstIFDOffset;
      const dirEntries = view.getUint16(dirOffset, littleEndian);
      dirOffset += 2;

      for (let i = 0; i < dirEntries; i++) {
        const entryOffset = dirOffset + i * 12;
        const tag = view.getUint16(entryOffset, littleEndian);
        if (tag === ORIENTATION_TAG) {
          const value = view.getUint16(entryOffset + 8, littleEndian) as Orientation;
          return value >= 1 && value <= 8 ? value : 1;
        }
      }

      break;
    } else if ((marker & 0xff00) !== 0xff00) {
      break;
    } else {
      const size = view.getUint16(offset, false);
      offset += size;
    }
  }

  return 1;
}

export async function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("无法加载图片"));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getSourceDimensions(image: CanvasImageSource): { width: number; height: number } {
  if (image instanceof HTMLImageElement) {
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height
    };
  }

  if (image instanceof HTMLVideoElement) {
    return { width: image.videoWidth, height: image.videoHeight };
  }

  if (image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height };
  }

  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return { width: image.width, height: image.height };
  }

  const anyImage = image as { width?: number; height?: number };
  return {
    width: anyImage.width ?? 0,
    height: anyImage.height ?? 0
  };
}

function applyOrientation(
  image: { width: number; height: number },
  draw: (ctx: CanvasRenderingContext2D) => void,
  orientation: Orientation
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("无法获取画布上下文");
  }

  const { width, height } = image;

  switch (orientation) {
    case 2:
      canvas.width = width;
      canvas.height = height;
      context.translate(width, 0);
      context.scale(-1, 1);
      break;
    case 3:
      canvas.width = width;
      canvas.height = height;
      context.translate(width, height);
      context.rotate(Math.PI);
      break;
    case 4:
      canvas.width = width;
      canvas.height = height;
      context.translate(0, height);
      context.scale(1, -1);
      break;
    case 5:
      canvas.width = height;
      canvas.height = width;
      context.rotate(0.5 * Math.PI);
      context.translate(0, -height);
      context.scale(1, -1);
      break;
    case 6:
      canvas.width = height;
      canvas.height = width;
      context.rotate(0.5 * Math.PI);
      context.translate(0, -height);
      break;
    case 7:
      canvas.width = height;
      canvas.height = width;
      context.rotate(0.5 * Math.PI);
      context.translate(width, -height);
      context.scale(-1, 1);
      break;
    case 8:
      canvas.width = height;
      canvas.height = width;
      context.rotate(-0.5 * Math.PI);
      context.translate(-width, 0);
      break;
    case 1:
    default:
      canvas.width = width;
      canvas.height = height;
      break;
  }

  draw(context);
  return canvas;
}

function drawImageWithOrientation(
  image: CanvasImageSource,
  orientation: Orientation
): HTMLCanvasElement {
  return applyOrientation(
    getSourceDimensions(image),
    (ctx) => {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0);
    },
    orientation
  );
}

function scaleCanvas(canvas: HTMLCanvasElement, maxSide = 2048): HTMLCanvasElement {
  const { width, height } = canvas;
  const longestSide = Math.max(width, height);

  if (longestSide <= maxSide) {
    return canvas;
  }

  const scale = maxSide / longestSide;
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);
  const scaledCanvas = document.createElement("canvas");
  scaledCanvas.width = targetWidth;
  scaledCanvas.height = targetHeight;
  const context = scaledCanvas.getContext("2d");

  if (!context) {
    throw new Error("无法缩放画布");
  }

  context.imageSmoothingQuality = "high";
  context.drawImage(canvas, 0, 0, targetWidth, targetHeight);
  return scaledCanvas;
}

export function createBaseCanvas(
  image: CanvasImageSource,
  orientation: Orientation,
  options?: { maxInputSide?: number; maxOutputSide?: number }
): HTMLCanvasElement {
  const oriented = drawImageWithOrientation(image, orientation);
  const maxInput = options?.maxInputSide ?? 4096;
  if (Math.max(oriented.width, oriented.height) > maxInput) {
    throw new Error(`图片尺寸需小于 ${maxInput}px`);
  }
  const maxOutput = options?.maxOutputSide ?? 2048;
  return scaleCanvas(oriented, maxOutput);
}

export function extractImageData(canvas: HTMLCanvasElement): ImageData {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法读取画布数据");
  }
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
