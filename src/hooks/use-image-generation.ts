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

export function useImageGeneration() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('2K');
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
      throw new Error(data.error || 'Upload failed');
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
          return { ...img, uploading: false, uploadError: result.reason?.message || 'Upload failed' };
        }
      });

      setImages(updatedImages);

      if (uploadedImages.length === 0) {
        throw new Error('All images failed to upload');
      }

      const imageUrls = uploadedImages.map((img) => img.storageUrl);

      // Start SSE generation
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls, prompt: prompt.trim(), size }),
      });

      if (!response.ok) {
        throw new Error('Failed to start generation');
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
  }, [images, prompt, size]);

  return {
    images,
    prompt,
    setPrompt,
    size,
    setSize,
    isGenerating,
    progress,
    results,
    addImages,
    removeImage,
    clearImages,
    startGeneration,
  };
}
