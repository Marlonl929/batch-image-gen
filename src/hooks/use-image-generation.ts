'use client';

import { useState, useCallback } from 'react';

export interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
  storageUrl: string;
  storageKey: string;
  uploading: boolean;
  uploadError?: string;
}

export interface GenerationResult {
  index: number;
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface GenerationProgress {
  current: number;
  total: number;
}

export const RESOLUTIONS: Record<string, { base: number; label: string }> = {
  '1K': { base: 2560, label: '1K' },
  '2K': { base: 3200, label: '2K' },
  '4K': { base: 4096, label: '4K' },
};

export const ASPECT_RATIOS: Record<string, { w: number; h: number; label: string }> = {
  auto: { w: 16, h: 9, label: 'auto' },
  '1:1': { w: 1, h: 1, label: '1:1' },
  '1:3': { w: 1, h: 3, label: '1:3' },
  '3:1': { w: 3, h: 1, label: '3:1' },
  '16:9': { w: 16, h: 9, label: '16:9' },
  '9:16': { w: 9, h: 16, label: '9:16' },
  '4:3': { w: 4, h: 3, label: '4:3' },
  '3:4': { w: 3, h: 4, label: '3:4' },
  '3:2': { w: 3, h: 2, label: '3:2' },
  '2:3': { w: 2, h: 3, label: '2:3' },
  '5:4': { w: 5, h: 4, label: '5:4' },
  '4:5': { w: 4, h: 5, label: '4:5' },
  '2:1': { w: 2, h: 1, label: '2:1' },
  '1:2': { w: 1, h: 2, label: '1:2' },
  '21:9': { w: 21, h: 9, label: '21:9' },
  '9:21': { w: 9, h: 21, label: '9:21' },
};

export function calculateSize(resolution: string, aspectRatio: string): string {
  // "auto" uses the resolution preset directly, let API decide
  if (aspectRatio === 'auto') {
    return resolution === '4K' ? '4K' : '2K';
  }

  const res = RESOLUTIONS[resolution];
  const ratio = ASPECT_RATIOS[aspectRatio];
  if (!res || !ratio) return '2K';

  let w = res.base;
  let h = Math.round(res.base * ratio.h / ratio.w);

  // SDK range: 2560x1440 ~ 4096x4096
  if (w < 2560) w = 2560;
  if (w > 4096) w = 4096;
  if (h < 1440) h = 1440;
  if (h > 4096) h = 4096;

  return `${w}x${h}`;
}

export function useImageGeneration() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState('2K');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [results, setResults] = useState<GenerationResult[]>([]);

  const addImages = useCallback((files: FileList | File[]) => {
    const newImages: UploadedImage[] = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        storageUrl: '',
        storageKey: '',
        uploading: false,
      }));

    setImages((prev) => [...prev, ...newImages]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clearImages = useCallback(() => {
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      return [];
    });
    setResults([]);
    setProgress(null);
  }, []);

  const uploadImage = async (image: UploadedImage): Promise<UploadedImage> => {
    const formData = new FormData();
    formData.append('file', image.file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || '\u4e0a\u4f20\u5931\u8d25');
    }

    const data = await response.json();
    return {
      ...image,
      storageUrl: data.url,
      storageKey: data.key,
      uploading: false,
    };
  };

  const startGeneration = useCallback(async () => {
    if (images.length === 0 || !prompt.trim()) return;

    setIsGenerating(true);
    setResults([]);
    setProgress(null);

    try {
      // Upload all images first
      setImages((prev) => prev.map((img) => ({ ...img, uploading: true })));

      const uploadResults = await Promise.allSettled(
        images.map((img) => uploadImage(img))
      );

      const uploadedImages: UploadedImage[] = [];
      const updatedImages = images.map((img, idx) => {
        const result = uploadResults[idx];
        if (result.status === 'fulfilled') {
          uploadedImages.push(result.value);
          return result.value;
        } else {
          return { ...img, uploading: false, uploadError: result.reason?.message || '\u4e0a\u4f20\u5931\u8d25' };
        }
      });

      setImages(updatedImages);

      if (uploadedImages.length === 0) {
        throw new Error('\u6240\u6709\u56fe\u7247\u4e0a\u4f20\u5931\u8d25');
      }

      const imageUrls = uploadedImages.map((img) => img.storageUrl);
      const size = calculateSize(resolution, aspectRatio);

      // Start SSE generation
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls, prompt: prompt.trim(), size }),
      });

      if (!response.ok) {
        throw new Error('\u542f\u52a8\u751f\u6210\u5931\u8d25');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              setProgress({ current: data.current, total: data.total });
            } else if (data.type === 'result') {
              setResults((prev) => [...prev, data]);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [images, prompt, resolution, aspectRatio]);

  return {
    images,
    prompt,
    setPrompt,
    resolution,
    setResolution,
    aspectRatio,
    setAspectRatio,
    isGenerating,
    progress,
    results,
    addImages,
    removeImage,
    clearImages,
    startGeneration,
  };
}
