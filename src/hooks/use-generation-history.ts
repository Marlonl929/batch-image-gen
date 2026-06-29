'use client';

import { useState, useEffect, useCallback } from 'react';

export interface HistoryRecord {
  id: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  createdAt: number; // timestamp
  expiresAt: number; // timestamp (createdAt + 72h)
  results: {
    index: number;
    success: boolean;
    imageUrl?: string;
    error?: string;
    sourcePreviewUrl?: string; // base64 thumbnail of source image
  }[];
}

const STORAGE_KEY = 'generation_history';
const RETENTION_MS = 72 * 60 * 60 * 1000; // 72 hours

function getStoredHistory(): HistoryRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records: HistoryRecord[] = JSON.parse(raw);
    // Filter out expired records
    const now = Date.now();
    return records.filter((r) => r.expiresAt > now);
  } catch {
    return [];
  }
}

function saveHistory(records: HistoryRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage might be full, remove oldest records
    if (records.length > 5) {
      const trimmed = records.slice(-5);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    }
  }
}

// Convert a file to a small base64 thumbnail
export function fileToThumbnail(file: File, maxSize = 200): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        } else {
          if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function useGenerationHistory() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // Load history on mount and clean expired
  useEffect(() => {
    const records = getStoredHistory();
    setHistory(records);
    // Persist cleaned records (remove expired)
    saveHistory(records);
  }, []);

  const addRecord = useCallback((record: Omit<HistoryRecord, 'id' | 'createdAt' | 'expiresAt'>) => {
    const now = Date.now();
    const newRecord: HistoryRecord = {
      ...record,
      id: `hist-${now}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      expiresAt: now + RETENTION_MS,
    };

    setHistory((prev) => {
      // Also clean expired on add
      const valid = prev.filter((r) => r.expiresAt > now);
      const updated = [...valid, newRecord];
      saveHistory(updated);
      return updated;
    });
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return { history, addRecord, deleteRecord, clearHistory };
}
