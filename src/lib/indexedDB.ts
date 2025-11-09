import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { type MaskAdjustments } from "@/lib/mask";

interface HairColorPreset {
  id: string;
  name: string;
  intensity: number;
  gloss: number;
  texture: number;
  createdAt: number;
}

interface HairColorDB extends DBSchema {
  presets: {
    key: string;
    value: HairColorPreset;
    indexes: { "by-name": string };
  };
  favorites: {
    key: string;
    value: HairColorPreset;
    indexes: { "by-created": number };
  };
  masks: {
    key: string;
    value: MaskEntry;
    indexes: { "by-updated": number };
  };
}

const DB_NAME = "hair-color-preview";
const DB_VERSION = 2;
let dbPromise: Promise<IDBPDatabase<HairColorDB>> | null = null;

async function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<HairColorDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1 || !database.objectStoreNames.contains("presets")) {
          const store = database.createObjectStore("presets", {
            keyPath: "id"
          });
          store.createIndex("by-name", "name", { unique: false });
        }
        if (oldVersion < 1 || !database.objectStoreNames.contains("favorites")) {
          const store = database.createObjectStore("favorites", {
            keyPath: "id"
          });
          store.createIndex("by-created", "createdAt", { unique: false });
        }
        if (!database.objectStoreNames.contains("masks")) {
          const store = database.createObjectStore("masks", {
            keyPath: "id"
          });
          store.createIndex("by-updated", "updatedAt", { unique: false });
        }
      }
    });
  }

  return dbPromise;
}

interface MaskEntry {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  adjustments: MaskAdjustments;
  updatedAt: number;
}

const ACTIVE_MASK_ID = "active-mask";

export async function savePreset(preset: HairColorPreset) {
  const db = await initDB();
  await db.put("presets", preset);
  return preset;
}

export async function getPresets() {
  const db = await initDB();
  return db.getAll("presets");
}

export async function addFavorite(preset: HairColorPreset) {
  const db = await initDB();
  await db.put("favorites", preset);
  return preset;
}

export async function getFavorites() {
  const db = await initDB();
  return db.getAll("favorites");
}

export async function removeFavorite(id: string) {
  const db = await initDB();
  await db.delete("favorites", id);
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
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

export async function saveMaskCanvas(
  canvas: HTMLCanvasElement,
  adjustments: MaskAdjustments
) {
  const db = await initDB();
  const blob = await canvasToBlob(canvas);
  const entry: MaskEntry = {
    id: ACTIVE_MASK_ID,
    blob,
    width: canvas.width,
    height: canvas.height,
    adjustments,
    updatedAt: Date.now()
  };

  await db.put("masks", entry);
  return entry;
}

export async function loadMaskCanvas() {
  const db = await initDB();
  return db.get("masks", ACTIVE_MASK_ID);
}

export async function clearMaskCanvas() {
  const db = await initDB();
  if (db.objectStoreNames.contains("masks")) {
    await db.delete("masks", ACTIVE_MASK_ID);
  }
}

export type { HairColorPreset };
export type { MaskEntry };
