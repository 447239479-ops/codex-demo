import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent
} from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import {
  createBaseCanvas,
  extractImageData,
  loadImageElement,
  readImageOrientation
} from "@/lib/image";
import {
  applyMaskAdjustments,
  cloneImageData,
  normalizeMaskCanvas,
  normalizeMaskImageData,
  type MaskAdjustments
} from "@/lib/mask";
import {
  clearMaskCanvas,
  loadMaskCanvas,
  saveMaskCanvas
} from "@/lib/indexedDB";

interface Point {
  x: number;
  y: number;
}

type MaskTool = "brush" | "eraser" | "magic";

const INITIAL_MASK_STATUS = "使用画笔或快速选区粗略勾勒头发区域。";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("无法导出遮罩图像。"));
      }
    }, "image/png");
  });
}

export function HomePage() {
  const baseState = useAppStore((state) => ({
    intensity: state.intensity,
    gloss: state.gloss,
    texture: state.texture,
    showOriginal: state.showOriginal,
    sideBySide: state.sideBySide,
    baseCanvas: state.baseCanvas,
    baseImageData: state.baseImageData,
    maskAdjustments: state.maskAdjustments
  }));
  const actions = useAppStore((state) => ({
    setIntensity: state.setIntensity,
    setGloss: state.setGloss,
    setTexture: state.setTexture,
    toggleOriginal: state.toggleOriginal,
    toggleSideBySide: state.toggleSideBySide,
    setBaseCanvasData: state.setBaseCanvasData,
    setMaskCanvas: state.setMaskCanvas,
    setMaskAdjustments: state.setMaskAdjustments,
    initializeMaskHistory: state.initializeMaskHistory,
    commitMaskSnapshot: state.commitMaskSnapshot,
    undoMask: state.undoMask,
    redoMask: state.redoMask,
    canUndoMask: state.canUndoMask,
    canRedoMask: state.canRedoMask
  }));

  const {
    intensity,
    gloss,
    texture,
    showOriginal,
    sideBySide,
    baseCanvas,
    baseImageData,
    maskAdjustments
  } = baseState;
  const {
    setIntensity,
    setGloss,
    setTexture,
    toggleOriginal,
    toggleSideBySide,
    setBaseCanvasData,
    setMaskCanvas,
    setMaskAdjustments,
    initializeMaskHistory,
    commitMaskSnapshot,
    undoMask,
    redoMask,
    canUndoMask,
    canRedoMask
  } = actions;

  const canUndo = canUndoMask();
  const canRedo = canRedoMask();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskDataCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskImportInputRef = useRef<HTMLInputElement | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const hasLoadedMaskRef = useRef(false);

  const [statusMessage, setStatusMessage] = useState(
    "尚未加载照片，点击上传或拍照以开始。"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [maskTool, setMaskTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(28);
  const [magicThreshold, setMagicThreshold] = useState(24);
  const [maskStatus, setMaskStatus] = useState(INITIAL_MASK_STATUS);
  const [maskError, setMaskError] = useState<string | null>(null);
  const [isDrawingMask, setIsDrawingMask] = useState(false);
  const [hasMaskFill, setHasMaskFill] = useState(false);

  useEffect(() => {
    const displayCanvas = displayCanvasRef.current;
    if (!displayCanvas) {
      return;
    }

    const context = displayCanvas.getContext("2d");
    if (!context) {
      return;
    }

    if (baseCanvas) {
      displayCanvas.width = baseCanvas.width;
      displayCanvas.height = baseCanvas.height;
      context.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
      context.drawImage(baseCanvas, 0, 0);
    } else {
      context.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    }
  }, [baseCanvas]);

  const processFile = useCallback(
    async (file: File, options?: { skipOrientation?: boolean }) => {
      const orientation = options?.skipOrientation
        ? 1
        : await readImageOrientation(file);
      const image = await loadImageElement(file);
      const canvas = createBaseCanvas(image, orientation, {
        maxInputSide: 4096,
        maxOutputSide: 2048
      });
      const imageData = extractImageData(canvas);
      setBaseCanvasData(canvas, imageData);
    },
    [setBaseCanvasData]
  );

  const handleUploadClick = () => {
    if (isProcessing) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setIsProcessing(true);
    setStatusMessage("正在解析照片，请稍候…");
    setErrorMessage(null);

    try {
      await processFile(file);
      setStatusMessage("照片加载完成，可继续调节发色。");
    } catch (error) {
      let message = "处理图片时出现问题，请重试或选择另一张照片。";
      if (error instanceof Error) {
        message = error.message;
      }
      setErrorMessage(message);
      setStatusMessage("未能加载照片，已保留上次效果。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCapture = async () => {
    if (isProcessing) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("当前浏览器不支持相机访问，请改用上传功能。");
      setStatusMessage("请通过上传照片继续体验。");
      return;
    }

    setIsProcessing(true);
    setStatusMessage("正在打开前置摄像头…");
    setErrorMessage(null);

    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await video.play();

      if (video.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const handleLoaded = () => {
            video.removeEventListener("loadeddata", handleLoaded);
            video.removeEventListener("error", handleError);
            resolve();
          };
          const handleError = () => {
            video.removeEventListener("loadeddata", handleLoaded);
            video.removeEventListener("error", handleError);
            reject(new Error("无法加载视频流。"));
          };
          video.addEventListener("loadeddata", handleLoaded, { once: true });
          video.addEventListener("error", handleError, { once: true });
        });
      }

      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
      if (!captureCanvas.width || !captureCanvas.height) {
        throw new Error("未能获取摄像头画面尺寸。");
      }
      const context = captureCanvas.getContext("2d");
      if (!context) {
        throw new Error("无法捕获画面。");
      }

      context.drawImage(video, 0, 0);

      const blob = await new Promise<Blob>((resolve, reject) => {
        captureCanvas.toBlob((result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("无法读取照片数据。"));
          }
        }, "image/jpeg", 0.95);
      });

      video.pause();
      video.srcObject = null;

      await processFile(
        new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }),
        { skipOrientation: true }
      );

      setStatusMessage("已拍摄照片，可继续调节发色。");
    } catch (error) {
      let message = "无法打开相机，请检查权限或改用上传功能。";
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          message = "相机访问被拒绝，请在浏览器设置中允许访问或改用上传功能。";
          if (!window.isSecureContext && /iPad|iPhone|iPod/i.test(navigator.userAgent)) {
            message = "iOS Safari 需要通过 HTTPS 或 localhost 访问才能启用相机，请改用上传功能。";
          }
        } else if (error.name === "NotFoundError") {
          message = "未检测到可用摄像头，请改用上传功能。";
        } else if (error.name === "NotReadableError") {
          message = "相机正被其他应用占用，请稍后重试或改用上传功能。";
        }
      } else if (error instanceof Error) {
        message = error.message;
      }

      setErrorMessage(message);
      setStatusMessage("拍照失败，请改用上传或调整权限后重试。");
    } finally {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setIsProcessing(false);
    }
  };
  const normalizeMask = useCallback(
    (options?: { silent?: boolean; statusMessage?: string }) => {
      const maskCanvasElement = maskDataCanvasRef.current;
      if (!maskCanvasElement) {
        return null;
      }
      const normalized = normalizeMaskCanvas(maskCanvasElement);
      if (!normalized) {
        return null;
      }

      setHasMaskFill(normalized.hasFill);
      if (!options?.silent) {
        setMaskStatus(
          options?.statusMessage ??
            (normalized.hasFill
              ? "遮罩已更新，可继续调整或导出。"
              : INITIAL_MASK_STATUS)
        );
      }
      setMaskError(null);
      return normalized.imageData;
    },
    []
  );

  const renderProcessedMask = useCallback(() => {
    const baseMaskCanvas = maskDataCanvasRef.current;
    const overlayCanvas = maskOverlayCanvasRef.current;
    if (!baseMaskCanvas || !overlayCanvas) {
      return;
    }

    const processedCanvas =
      processedMaskCanvasRef.current ?? document.createElement("canvas");
    processedCanvas.width = baseMaskCanvas.width;
    processedCanvas.height = baseMaskCanvas.height;
    processedMaskCanvasRef.current = processedCanvas;

    const maskContext = baseMaskCanvas.getContext("2d", {
      willReadFrequently: true
    });
    const processedContext = processedCanvas.getContext("2d");
    const overlayContext = overlayCanvas.getContext("2d");

    if (!maskContext || !processedContext || !overlayContext) {
      return;
    }

    const baseData = maskContext.getImageData(
      0,
      0,
      baseMaskCanvas.width,
      baseMaskCanvas.height
    );
    const adjustedData = applyMaskAdjustments(baseData, maskAdjustments);

    processedContext.clearRect(0, 0, processedCanvas.width, processedCanvas.height);
    processedContext.putImageData(adjustedData, 0, 0);

    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayContext.save();
    overlayContext.globalAlpha = 0.55;
    overlayContext.drawImage(processedCanvas, 0, 0);
    overlayContext.globalCompositeOperation = "source-in";
    overlayContext.fillStyle = "rgba(244, 63, 94, 0.9)";
    overlayContext.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    overlayContext.restore();
  }, [maskAdjustments]);

  const persistMask = useCallback(async () => {
    const maskCanvasElement = maskDataCanvasRef.current;
    if (!maskCanvasElement) {
      return;
    }

    try {
      if (!hasMaskFill) {
        await clearMaskCanvas();
        setMaskStatus("遮罩已清空，可重新绘制。");
        setMaskError(null);
        return;
      }

      await saveMaskCanvas(maskCanvasElement, maskAdjustments);
      setMaskStatus("遮罩已保存，刷新后会自动恢复。");
      setMaskError(null);
    } catch (error) {
      setMaskError(
        error instanceof Error
          ? error.message
          : "保存遮罩时出现问题，请稍后重试。"
      );
    }
  }, [hasMaskFill, maskAdjustments]);

  const scheduleMaskSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void persistMask();
    }, 600);
  }, [persistMask]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const overlayCanvas = maskOverlayCanvasRef.current;
    if (!overlayCanvas) {
      return;
    }

    if (!baseCanvas) {
      overlayCanvas.width = 0;
      overlayCanvas.height = 0;
      const overlayContext = overlayCanvas.getContext("2d");
      overlayContext?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      return;
    }

    overlayCanvas.width = baseCanvas.width;
    overlayCanvas.height = baseCanvas.height;
    const overlayContext = overlayCanvas.getContext("2d");
    overlayContext?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    renderProcessedMask();
  }, [baseCanvas, renderProcessedMask]);

  const prepareMaskCanvas = useCallback(() => {
    if (!baseCanvas) {
      maskDataCanvasRef.current = null;
      processedMaskCanvasRef.current = null;
      setMaskCanvas(null);
      setMaskStatus(INITIAL_MASK_STATUS);
      setMaskError(null);
      setHasMaskFill(false);
      hasLoadedMaskRef.current = false;
      return;
    }

    let maskCanvasElement = maskDataCanvasRef.current;
    if (!maskCanvasElement) {
      maskCanvasElement = document.createElement("canvas");
      maskDataCanvasRef.current = maskCanvasElement;
    }

    maskCanvasElement.width = baseCanvas.width;
    maskCanvasElement.height = baseCanvas.height;
    const maskContext = maskCanvasElement.getContext("2d", {
      willReadFrequently: true
    });
    maskContext?.clearRect(0, 0, maskCanvasElement.width, maskCanvasElement.height);

    processedMaskCanvasRef.current = null;
    setMaskCanvas(maskCanvasElement);
    setMaskAdjustments({ feather: 0, dilate: 0, erode: 0 });

    const normalized = normalizeMask({ silent: true });
    if (normalized) {
      initializeMaskHistory(normalized);
    }
    setMaskStatus(INITIAL_MASK_STATUS);
    setMaskError(null);
    setHasMaskFill(false);
    hasLoadedMaskRef.current = false;
  }, [baseCanvas, initializeMaskHistory, normalizeMask, setMaskCanvas]);

  useEffect(() => {
    prepareMaskCanvas();
  }, [prepareMaskCanvas]);

  const loadStoredMask = useCallback(async () => {
    if (!baseCanvas || !maskDataCanvasRef.current || hasLoadedMaskRef.current) {
      return;
    }

    try {
      const entry = await loadMaskCanvas();
      if (!entry) {
        hasLoadedMaskRef.current = true;
        return;
      }

      if (
        entry.width !== baseCanvas.width ||
        entry.height !== baseCanvas.height
      ) {
        await clearMaskCanvas();
        hasLoadedMaskRef.current = true;
        setMaskStatus("检测到历史遮罩尺寸不同，已忽略旧遮罩。");
        return;
      }

      const maskContext = maskDataCanvasRef.current.getContext("2d");
      if (!maskContext) {
        hasLoadedMaskRef.current = true;
        return;
      }

      const bitmap = await createImageBitmap(entry.blob);
      maskContext.clearRect(0, 0, entry.width, entry.height);
      maskContext.drawImage(bitmap, 0, 0);

      const normalized = normalizeMask({
        statusMessage: "已恢复上次遮罩，可继续精修。"
      });
      if (normalized) {
        initializeMaskHistory(normalized);
        setMaskAdjustments(entry.adjustments as MaskAdjustments);
        renderProcessedMask();
      }
      hasLoadedMaskRef.current = true;
    } catch (error) {
      setMaskError(
        error instanceof Error
          ? error.message
          : "读取遮罩数据时出现问题，请稍后重试。"
      );
      hasLoadedMaskRef.current = true;
    }
  }, [
    baseCanvas,
    initializeMaskHistory,
    normalizeMask,
    renderProcessedMask,
    setMaskAdjustments
  ]);

  useEffect(() => {
    void loadStoredMask();
  }, [loadStoredMask]);

  useEffect(() => {
    if (!maskDataCanvasRef.current) {
      return;
    }
    renderProcessedMask();
    if (hasMaskFill) {
      setMaskStatus("已应用边缘微调，可继续预览效果。");
      scheduleMaskSave();
    }
  }, [maskAdjustments, hasMaskFill, renderProcessedMask, scheduleMaskSave]);

  const getMaskCoordinates = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      const overlayCanvas = maskOverlayCanvasRef.current;
      if (!overlayCanvas || !overlayCanvas.width || !overlayCanvas.height) {
        return null;
      }
      const rect = overlayCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return null;
      }
      const x =
        ((event.clientX - rect.left) / rect.width) * overlayCanvas.width;
      const y =
        ((event.clientY - rect.top) / rect.height) * overlayCanvas.height;
      return { x, y };
    },
    []
  );

  const drawMaskStroke = useCallback(
    (from: Point, to: Point, tool: MaskTool) => {
      const maskCanvasElement = maskDataCanvasRef.current;
      if (!maskCanvasElement) {
        return;
      }
      const context = maskCanvasElement.getContext("2d");
      if (!context) {
        return;
      }

      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = brushSize;
      context.strokeStyle = "rgba(255,255,255,1)";
      context.globalCompositeOperation =
        tool === "eraser" ? "destination-out" : "source-over";
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      context.restore();

      renderProcessedMask();
    },
    [brushSize, renderProcessedMask]
  );

  const applyMagicSelection = useCallback(
    (point: Point) => {
      if (!baseImageData || !maskDataCanvasRef.current) {
        setMaskError("请先加载照片再使用快速选区。");
        return;
      }

      const maskCanvasElement = maskDataCanvasRef.current;
      const maskWidth = maskCanvasElement.width;
      const maskHeight = maskCanvasElement.height;
      if (!maskWidth || !maskHeight) {
        return;
      }

      const baseWidth = baseImageData.width;
      const baseHeight = baseImageData.height;
      if (!baseWidth || !baseHeight) {
        return;
      }

      const sampleX = Math.min(
        baseWidth - 1,
        Math.max(0, Math.round((point.x / maskWidth) * baseWidth))
      );
      const sampleY = Math.min(
        baseHeight - 1,
        Math.max(0, Math.round((point.y / maskHeight) * baseHeight))
      );

      const data = baseImageData.data;
      const visited = new Uint8Array(baseWidth * baseHeight);
      const selection = new Uint8Array(baseWidth * baseHeight);
      const stack: Point[] = [{ x: sampleX, y: sampleY }];

      const seedIndex = (sampleY * baseWidth + sampleX) * 4;
      const seedR = data[seedIndex];
      const seedG = data[seedIndex + 1];
      const seedB = data[seedIndex + 2];
      const maxDifference = (magicThreshold / 100) * 765;

      while (stack.length) {
        const current = stack.pop() as Point;
        const { x, y } = current;
        const idx = y * baseWidth + x;
        if (visited[idx]) {
          continue;
        }
        visited[idx] = 1;

        const pixelIndex = idx * 4;
        const diff =
          Math.abs(data[pixelIndex] - seedR) +
          Math.abs(data[pixelIndex + 1] - seedG) +
          Math.abs(data[pixelIndex + 2] - seedB);
        if (diff > maxDifference) {
          continue;
        }

        selection[idx] = 1;

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) {
              continue;
            }
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (
              nextX < 0 ||
              nextY < 0 ||
              nextX >= baseWidth ||
              nextY >= baseHeight
            ) {
              continue;
            }
            stack.push({ x: nextX, y: nextY });
          }
        }
      }

      const maskContext = maskCanvasElement.getContext("2d", {
        willReadFrequently: true
      });
      if (!maskContext) {
        return;
      }

      const maskImageData = maskContext.getImageData(0, 0, maskWidth, maskHeight);
      const maskPixels = maskImageData.data;
      const widthRatio = maskWidth > 1 ? (maskWidth - 1) / (baseWidth - 1 || 1) : 1;
      const heightRatio = maskHeight > 1 ? (maskHeight - 1) / (baseHeight - 1 || 1) : 1;

      for (let y = 0; y < baseHeight; y += 1) {
        for (let x = 0; x < baseWidth; x += 1) {
          if (!selection[y * baseWidth + x]) {
            continue;
          }
          const maskX = Math.min(
            maskWidth - 1,
            Math.round(x * widthRatio)
          );
          const maskY = Math.min(
            maskHeight - 1,
            Math.round(y * heightRatio)
          );
          const targetIndex = (maskY * maskWidth + maskX) * 4;
          maskPixels[targetIndex] = 255;
          maskPixels[targetIndex + 1] = 255;
          maskPixels[targetIndex + 2] = 255;
          maskPixels[targetIndex + 3] = 255;
        }
      }

      maskContext.putImageData(maskImageData, 0, 0);
      renderProcessedMask();

      const normalized = normalizeMask({
        statusMessage: "快速选区已填充，建议检查边缘。"
      });
      if (normalized) {
        commitMaskSnapshot(normalized);
        scheduleMaskSave();
      }
    },
    [
      baseImageData,
      commitMaskSnapshot,
      magicThreshold,
      normalizeMask,
      renderProcessedMask,
      scheduleMaskSave
    ]
  );

  const finishMaskStroke = useCallback(() => {
    if (!isDrawingMask) {
      return;
    }
    setIsDrawingMask(false);
    lastPointRef.current = null;
    const normalized = normalizeMask({
      statusMessage: "遮罩已更新，可继续微调。"
    });
    if (normalized) {
      commitMaskSnapshot(normalized);
      scheduleMaskSave();
    }
    renderProcessedMask();
  }, [
    commitMaskSnapshot,
    isDrawingMask,
    normalizeMask,
    renderProcessedMask,
    scheduleMaskSave
  ]);

  const handleMaskPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!baseCanvas) {
        setMaskError("请先加载照片后再编辑遮罩。");
        setMaskStatus("请上传或拍照后再启用遮罩工具。");
        return;
      }

      const coordinates = getMaskCoordinates(event);
      if (!coordinates) {
        return;
      }

      if (maskTool === "magic") {
        event.preventDefault();
        applyMagicSelection(coordinates);
        return;
      }

      if (!maskDataCanvasRef.current) {
        return;
      }

      event.preventDefault();
      setIsDrawingMask(true);
      lastPointRef.current = coordinates;
      event.currentTarget.setPointerCapture(event.pointerId);
      setMaskStatus("正在绘制遮罩，可松开手指结束。");
      drawMaskStroke(coordinates, coordinates, maskTool);
    },
    [applyMagicSelection, baseCanvas, drawMaskStroke, getMaskCoordinates, maskTool]
  );

  const handleMaskPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingMask || !lastPointRef.current) {
        return;
      }
      const coordinates = getMaskCoordinates(event);
      if (!coordinates) {
        return;
      }
      event.preventDefault();
      drawMaskStroke(lastPointRef.current, coordinates, maskTool);
      lastPointRef.current = coordinates;
    },
    [drawMaskStroke, getMaskCoordinates, isDrawingMask, maskTool]
  );

  const handleMaskPointerUp = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishMaskStroke();
    },
    [finishMaskStroke]
  );

  const handleMaskPointerLeave = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishMaskStroke();
    },
    [finishMaskStroke]
  );

  const handleUndoMask = useCallback(() => {
    if (!maskDataCanvasRef.current) {
      return;
    }
    const restored = undoMask();
    if (!restored) {
      return;
    }
    const context = maskDataCanvasRef.current.getContext("2d");
    if (!context) {
      return;
    }
    const clone = cloneImageData(restored);
    const normalized = normalizeMaskImageData(clone);
    context.putImageData(normalized.imageData, 0, 0);
    setHasMaskFill(normalized.hasFill);
    setMaskStatus(normalized.hasFill ? "已撤销上一步操作。" : INITIAL_MASK_STATUS);
    setMaskError(null);
    renderProcessedMask();
    scheduleMaskSave();
  }, [renderProcessedMask, scheduleMaskSave, undoMask]);

  const handleRedoMask = useCallback(() => {
    if (!maskDataCanvasRef.current) {
      return;
    }
    const restored = redoMask();
    if (!restored) {
      return;
    }
    const context = maskDataCanvasRef.current.getContext("2d");
    if (!context) {
      return;
    }
    const clone = cloneImageData(restored);
    const normalized = normalizeMaskImageData(clone);
    context.putImageData(normalized.imageData, 0, 0);
    setHasMaskFill(normalized.hasFill);
    setMaskStatus(normalized.hasFill ? "已恢复撤销的遮罩。" : INITIAL_MASK_STATUS);
    setMaskError(null);
    renderProcessedMask();
    scheduleMaskSave();
  }, [redoMask, renderProcessedMask, scheduleMaskSave]);

  const handleClearMask = useCallback(async () => {
    if (!maskDataCanvasRef.current) {
      return;
    }
    const context = maskDataCanvasRef.current.getContext("2d");
    if (!context) {
      return;
    }
    context.clearRect(0, 0, maskDataCanvasRef.current.width, maskDataCanvasRef.current.height);
    const normalized = normalizeMask({
      statusMessage: "遮罩已清除，可重新绘制。"
    });
    if (normalized) {
      initializeMaskHistory(normalized);
    }
    setMaskAdjustments({ feather: 0, dilate: 0, erode: 0 });
    setHasMaskFill(false);
    renderProcessedMask();
    await clearMaskCanvas();
  }, [
    initializeMaskHistory,
    normalizeMask,
    renderProcessedMask,
    setMaskAdjustments
  ]);

  const handleExportMask = useCallback(async () => {
    const sourceCanvas =
      processedMaskCanvasRef.current ?? maskDataCanvasRef.current;
    if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) {
      setMaskError("暂无可导出的遮罩，请先绘制。");
      return;
    }

    try {
      const blob = await canvasToBlob(sourceCanvas);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hair-mask-${Date.now()}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMaskStatus("已导出遮罩 PNG，可备份或共享。");
      setMaskError(null);
    } catch (error) {
      setMaskError(
        error instanceof Error
          ? error.message
          : "导出遮罩时出现问题，请稍后重试。"
      );
    }
  }, []);

  const handleMaskToolChange = useCallback((tool: MaskTool) => {
    setMaskTool(tool);
    if (tool === "magic") {
      setMaskStatus("点击画面即可快速选中颜色相近区域。");
    } else if (tool === "eraser") {
      setMaskStatus("橡皮模式：可擦除误涂区域。");
    } else {
      setMaskStatus("画笔模式：沿头发边缘勾勒遮罩。");
    }
  }, []);

  const handleAdjustmentChange = useCallback(
    (key: keyof MaskAdjustments) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      setMaskAdjustments({ [key]: value });
    },
    [setMaskAdjustments]
  );

  const handleMaskImportClick = useCallback(() => {
    if (!baseCanvas) {
      setMaskError("请先加载照片后再导入遮罩。");
      setMaskStatus("请先上传或拍照以创建遮罩。");
      return;
    }
    maskImportInputRef.current?.click();
  }, [baseCanvas]);

  const handleMaskImportChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      if (file.type !== "image/png") {
        setMaskError("请上传 PNG 遮罩文件。");
        return;
      }

      if (!baseCanvas || !maskDataCanvasRef.current) {
        setMaskError("请先加载照片后再导入遮罩。");
        return;
      }

      try {
        setMaskStatus("正在导入遮罩…");
        const image = await loadImageElement(file);
        const context = maskDataCanvasRef.current.getContext("2d");
        if (!context) {
          throw new Error("无法读取遮罩画布。");
        }
        context.clearRect(0, 0, maskDataCanvasRef.current.width, maskDataCanvasRef.current.height);
        context.drawImage(
          image,
          0,
          0,
          maskDataCanvasRef.current.width,
          maskDataCanvasRef.current.height
        );
        const normalized = normalizeMask({
          statusMessage: "已导入遮罩，可继续编辑或导出。"
        });
        if (normalized) {
          initializeMaskHistory(normalized);
          scheduleMaskSave();
        }
        renderProcessedMask();
      } catch (error) {
        setMaskError(
          error instanceof Error
            ? error.message
            : "导入遮罩失败，请确认文件有效。"
        );
        setMaskStatus("导入遮罩失败，请重试或手动绘制。");
      }
    },
    [
      baseCanvas,
      initializeMaskHistory,
      normalizeMask,
      renderProcessedMask,
      scheduleMaskSave
    ]
  );
  return (
    <div className="space-y-6" aria-labelledby="preview-heading">
      <section className="space-y-2" aria-label="上传或拍照">
        <h1 id="preview-heading" className="text-xl font-semibold">
          发色预览
        </h1>
        <p className="text-sm text-muted-foreground">
          上传照片或开启相机，实时预览不同发色效果。
        </p>
        <div className="flex gap-3" role="group" aria-label="上传选项">
          <Button
            className="flex-1"
            aria-label="上传照片"
            onClick={handleUploadClick}
            disabled={isProcessing}
          >
            上传照片
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            aria-label="开启相机"
            onClick={handleCapture}
            disabled={isProcessing}
          >
            拍照
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif"
          className="sr-only"
          aria-hidden="true"
          onChange={handleFileChange}
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          支持 JPG / PNG / HEIC，系统会自动校正方向并优化尺寸。
        </p>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          若相机不可用，请确认已授予权限；iOS Safari 需通过 HTTPS 或本地调试地址访问。
        </p>
      </section>

      <section
        className="space-y-3 rounded-2xl border border-dashed border-muted-foreground/40 bg-card/30 p-4"
        aria-label="发色预览画布"
        aria-busy={isProcessing}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">预览画布</h2>
          {baseCanvas ? (
            <span className="text-xs text-muted-foreground">
              {baseCanvas.width} × {baseCanvas.height}
            </span>
          ) : null}
        </div>
        <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-xl bg-background shadow-sm">
          <canvas
            ref={displayCanvasRef}
            className="h-auto w-full max-h-[420px]"
            role="img"
            aria-label="发色预览画布"
          />
          <canvas
            ref={maskOverlayCanvasRef}
            className="absolute inset-0 h-full w-full"
            aria-label="头发遮罩编辑画布"
            aria-disabled={!baseCanvas}
            aria-describedby="mask-status mask-instructions"
            tabIndex={baseCanvas ? 0 : -1}
            onPointerDown={handleMaskPointerDown}
            onPointerMove={handleMaskPointerMove}
            onPointerUp={handleMaskPointerUp}
            onPointerCancel={handleMaskPointerUp}
            onPointerLeave={handleMaskPointerLeave}
            style={{ touchAction: "none" }}
          />
          {!baseCanvas && (
            <p className="pointer-events-none px-6 text-center text-sm text-muted-foreground">
              预览画布将在您上传或拍照后显示，可双指缩放与拖拽（开发中）。
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {statusMessage}
        </p>
        {errorMessage ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <section
        className="space-y-4 rounded-2xl border border-border bg-card/20 p-4"
        aria-label="快速遮罩工具"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium">快速遮罩</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleUndoMask} disabled={!canUndo}>
              撤销
            </Button>
            <Button size="sm" variant="outline" onClick={handleRedoMask} disabled={!canRedo}>
              重做
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="遮罩工具">
          <Button
            size="sm"
            variant={maskTool === "brush" ? "default" : "outline"}
            aria-pressed={maskTool === "brush"}
            onClick={() => handleMaskToolChange("brush")}
          >
            画笔
          </Button>
          <Button
            size="sm"
            variant={maskTool === "eraser" ? "default" : "outline"}
            aria-pressed={maskTool === "eraser"}
            onClick={() => handleMaskToolChange("eraser")}
          >
            橡皮
          </Button>
          <Button
            size="sm"
            variant={maskTool === "magic" ? "default" : "outline"}
            aria-pressed={maskTool === "magic"}
            onClick={() => handleMaskToolChange("magic")}
          >
            快速选区
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="mask-brush-size"
              className="flex items-center justify-between text-sm font-medium"
            >
              <span>笔刷大小</span>
              <span className="text-xs text-muted-foreground">{brushSize}px</span>
            </label>
            <input
              id="mask-brush-size"
              type="range"
              min={4}
              max={120}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="w-full accent-primary"
              aria-valuetext={`${brushSize} 像素`}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="mask-magic-threshold"
              className="flex items-center justify-between text-sm font-medium"
            >
              <span>魔棒阈值</span>
              <span className="text-xs text-muted-foreground">{magicThreshold}</span>
            </label>
            <input
              id="mask-magic-threshold"
              type="range"
              min={0}
              max={100}
              value={magicThreshold}
              onChange={(event) => setMagicThreshold(Number(event.target.value))}
              className="w-full accent-primary"
              aria-valuetext={`${magicThreshold} 阈值`}
              aria-disabled={maskTool !== "magic"}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="边缘微调">
          <div className="space-y-2">
            <label
              htmlFor="mask-feather"
              className="flex items-center justify-between text-sm font-medium"
            >
              <span>边缘羽化</span>
              <span className="text-xs text-muted-foreground">{maskAdjustments.feather}px</span>
            </label>
            <input
              id="mask-feather"
              type="range"
              min={0}
              max={20}
              value={maskAdjustments.feather}
              onChange={handleAdjustmentChange("feather")}
              className="w-full accent-primary"
              aria-valuetext={`${maskAdjustments.feather} 像素`}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="mask-dilate"
              className="flex items-center justify-between text-sm font-medium"
            >
              <span>膨胀</span>
              <span className="text-xs text-muted-foreground">{maskAdjustments.dilate}px</span>
            </label>
            <input
              id="mask-dilate"
              type="range"
              min={0}
              max={10}
              value={maskAdjustments.dilate}
              onChange={handleAdjustmentChange("dilate")}
              className="w-full accent-primary"
              aria-valuetext={`${maskAdjustments.dilate} 像素`}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="mask-erode"
              className="flex items-center justify-between text-sm font-medium"
            >
              <span>腐蚀</span>
              <span className="text-xs text-muted-foreground">{maskAdjustments.erode}px</span>
            </label>
            <input
              id="mask-erode"
              type="range"
              min={0}
              max={10}
              value={maskAdjustments.erode}
              onChange={handleAdjustmentChange("erode")}
              className="w-full accent-primary"
              aria-valuetext={`${maskAdjustments.erode} 像素`}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleMaskImportClick}
            disabled={!baseCanvas}
          >
            导入遮罩
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportMask}
            disabled={!hasMaskFill}
          >
            导出遮罩
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearMask}
            disabled={!baseCanvas}
          >
            清除
          </Button>
        </div>
        <input
          ref={maskImportInputRef}
          type="file"
          accept="image/png"
          className="sr-only"
          aria-hidden="true"
          onChange={handleMaskImportChange}
        />
        <p
          id="mask-status"
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {maskStatus}
        </p>
        {maskError ? (
          <p className="text-xs font-medium text-destructive" role="alert">
            {maskError}
          </p>
        ) : null}
        <p id="mask-instructions" className="text-xs text-muted-foreground">
          小贴士：画笔支持长按连续绘制，魔棒阈值越大选区越宽。遮罩会自动保存在本地 IndexedDB，刷新也能恢复。
        </p>
      </section>

      <section className="space-y-4" aria-label="参数调节">
        <div className="space-y-2">
          <label htmlFor="intensity" className="flex items-center justify-between">
            <span className="text-sm font-medium">颜色强度</span>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {intensity}%
            </span>
          </label>
          <input
            id="intensity"
            type="range"
            min={0}
            max={100}
            value={intensity}
            onChange={(event) => setIntensity(Number(event.target.value))}
            className="w-full accent-primary"
            aria-valuetext={`${intensity} 百分比`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="质感调节">
          <fieldset className="space-y-2 rounded-xl border border-border p-4">
            <legend className="text-sm font-medium">光泽度</legend>
            <input
              id="gloss"
              type="range"
              min={0}
              max={100}
              value={gloss}
              onChange={(event) => setGloss(Number(event.target.value))}
              className="w-full accent-primary"
              aria-valuetext={`${gloss} 百分比`}
            />
          </fieldset>
          <fieldset className="space-y-2 rounded-xl border border-border p-4">
            <legend className="text-sm font-medium">发丝质地</legend>
            <input
              id="texture"
              type="range"
              min={0}
              max={100}
              value={texture}
              onChange={(event) => setTexture(Number(event.target.value))}
              className="w-full accent-primary"
              aria-valuetext={`${texture} 百分比`}
            />
          </fieldset>
        </div>
      </section>

      <section className="space-y-3" aria-label="对比选项">
        <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">前后对比</p>
            <p className="text-xs text-muted-foreground">按下即可查看原始发色</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              role="switch"
              className="h-5 w-10 cursor-pointer rounded-full border border-border bg-muted transition-all checked:bg-primary"
              aria-checked={showOriginal}
              checked={showOriginal}
              onChange={() => toggleOriginal()}
            />
            <span>{showOriginal ? "显示原图" : "显示效果"}</span>
          </label>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">并排比较</p>
            <p className="text-xs text-muted-foreground">同时查看多种配色</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              role="switch"
              className="h-5 w-10 cursor-pointer rounded-full border border-border bg-muted transition-all checked:bg-primary"
              aria-checked={sideBySide}
              checked={sideBySide}
              onChange={() => toggleSideBySide()}
            />
            <span>{sideBySide ? "并排" : "单视图"}</span>
          </label>
        </div>
      </section>

      <section aria-label="预设入口" className="space-y-2">
        <Button asChild className="w-full" aria-label="浏览发色预设">
          <Link to="/presets">查看发色预设库</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          支持收藏喜爱方案并同步造型师建议。
        </p>
      </section>
    </div>
  );
}
