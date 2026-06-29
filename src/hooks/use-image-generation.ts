'use client';

import { useState, useCallback, useRef } from 'react';

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
  if (aspectRatio === 'auto') {
    return resolution === '4K' ? '4K' : '2K';
  }

  const res = RESOLUTIONS[resolution];
  const ratio = ASPECT_RATIOS[aspectRatio];
  if (!res || !ratio) return '2K';

  let w = res.base;
  let h = Math.round(res.base * ratio.h / ratio.w);

  if (w < 2560) w = 2560;
  if (w > 4096) w = 4096;
  if (h < 1440) h = 1440;
  if (h > 4096) h = 4096;

  return `${w}x${h}`;
}

// Poll a single task from the client side
async function pollTask(
  taskId: string,
  apiKey: string,
  onUpdate: (status: string, progress: number) => void
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const maxAttempts = 60; // Max 5 minutes (60 * 5s)
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `/api/task-status/${taskId}?apiKey=${encodeURIComponent(apiKey)}`
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || '查询任务失败');
    }

    const data = await response.json();
    onUpdate(data.status, data.progress || 0);

    if (data.status === 'completed') {
      if (data.imageUrl) {
        return { success: true, imageUrl: data.imageUrl };
      }
      return { success: false, error: data.error || '未获取到生成结果' };
    }

    if (data.status === 'failed') {
      return { success: false, error: data.error || '生成失败' };
    }

    // Wait 5 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }

  return { success: false, error: '任务超时' };
}

export function useImageGeneration() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState('2K');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const abortRef = useRef(false);

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
      throw new Error(data.error || '上传失败');
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

    abortRef.current = false;
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
          return { ...img, uploading: false, uploadError: result.reason?.message || '上传失败' };
        }
      });

      setImages(updatedImages);

      if (uploadedImages.length === 0) {
        throw new Error('所有图片上传失败');
      }

      const imageUrls = uploadedImages.map((img) => img.storageUrl);

      const apiKey = localStorage.getItem('apimart_api_key') || '';
      if (!apiKey) {
        throw new Error('请先在右上角设置中配置 APIMart API Key');
      }

      // Step 1: Submit all tasks (backend returns immediately with task_ids)
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls,
          prompt: prompt.trim(),
          size: aspectRatio,
          resolution: resolution.toLowerCase(),
          apiKey,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '启动生成失败');
      }

      const { tasks, immediateErrors } = await response.json();
      const total = images.length;

      // Add immediate errors to results
      const initialResults: GenerationResult[] = immediateErrors.map(
        (err: { index: number; error: string }) => ({
          index: err.index,
          success: false,
          error: err.error,
        })
      );
      setResults(initialResults);
      setProgress({ current: immediateErrors.length, total });

      // Step 2: Client-side polling for each task
      if (tasks.length > 0) {
        const pollPromises = tasks.map(
          (task: { index: number; task_id: string }) =>
            pollTask(task.task_id, apiKey, (_status, _progress) => {
              // Optional: update per-task progress in UI
            }).then((result) => ({ index: task.index, ...result }))
        );

        // Process results as they complete
        const settledResults = await Promise.allSettled(pollPromises);

        if (!abortRef.current) {
          const newResults: GenerationResult[] = [];
          for (const settled of settledResults) {
            if (settled.status === 'fulfilled') {
              newResults.push(settled.value);
            } else {
              const idx = settledResults.indexOf(settled);
              const taskIndex = tasks[idx]?.index ?? 0;
              newResults.push({
                index: taskIndex,
                success: false,
                error: settled.reason?.message || '生成失败',
              });
            }
          }
          setResults((prev) => [...prev, ...newResults]);
          setProgress({ current: total, total });
        }
      }
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [images, prompt, resolution, aspectRatio]);

  const retryFailedGeneration = useCallback(async () => {
    const failedResults = results.filter((r) => !r.success);
    if (failedResults.length === 0) return;

    abortRef.current = false;
    setIsGenerating(true);
    setProgress(null);

    try {
      const failedIndices = failedResults.map((r) => r.index);
      const failedImages = failedIndices.map((idx) => images[idx]).filter((img) => img?.storageUrl);

      if (failedImages.length === 0) {
        throw new Error('没有可重试的图片');
      }

      const imageUrls = failedImages.map((img) => img.storageUrl);

      const apiKey = localStorage.getItem('apimart_api_key') || '';
      if (!apiKey) {
        throw new Error('请先在右上角设置中配置 APIMart API Key');
      }

      // Submit retry tasks
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls,
          prompt: prompt.trim(),
          size: aspectRatio,
          resolution: resolution.toLowerCase(),
          apiKey,
        }),
      });

      if (!response.ok) {
        throw new Error('启动生成失败');
      }

      const { tasks, immediateErrors } = await response.json();
      const total = failedImages.length;

      // Handle immediate errors
      for (const err of immediateErrors) {
        const originalIndex = failedIndices[err.index];
        setResults((prev) => {
          const newResults = prev.filter((r) => r.index !== originalIndex);
          return [...newResults, { index: originalIndex, success: false, error: err.error }];
        });
      }

      // Client-side polling for retry tasks
      if (tasks.length > 0) {
        const pollPromises = tasks.map(
          (task: { index: number; task_id: string }) =>
            pollTask(task.task_id, apiKey, () => {}).then((result) => ({
              index: task.index,
              ...result,
            }))
        );

        const settledResults = await Promise.allSettled(pollPromises);

        if (!abortRef.current) {
          for (let i = 0; i < settledResults.length; i++) {
            const settled = settledResults[i];
            const originalIndex = failedIndices[tasks[i]?.index ?? 0];

            if (settled.status === 'fulfilled') {
              const mappedResult = { ...settled.value, index: originalIndex };
              setResults((prev) => {
                const newResults = prev.filter((r) => r.index !== originalIndex);
                return [...newResults, mappedResult];
              });
            } else {
              const errorMessage = settled.reason?.message || '生成失败';
              setResults((prev) => {
                const newResults = prev.filter((r) => r.index !== originalIndex);
                return [...newResults, { index: originalIndex, success: false, error: errorMessage }];
              });
            }
          }
          setProgress({ current: total, total });
        }
      }
    } catch (error) {
      console.error('Retry generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [results, images, prompt, resolution, aspectRatio]);

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
    retryFailedGeneration,
  };
}
