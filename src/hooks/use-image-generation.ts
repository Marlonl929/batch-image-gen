'use client';

import { useState, useCallback, useRef } from 'react';
import { compressImage } from '@/lib/image-compressor';

export interface UploadedImage {
  id: string;
  file: File;
  previewUrl: string;
  storageUrl: string;
  storageKey: string;
  uploading: boolean;
  uploaded: boolean;
  uploadError?: string;
}

export interface GenerationResult {
  index: number;
  success: boolean;
  imageUrl?: string;
  error?: string;
  originalName?: string;
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
  apiUrl: string,
  onUpdate: (status: string, progress: number) => void
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const maxAttempts = 60; // Max 5 minutes (60 * 5s)
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `/api/task-status/${taskId}?apiKey=${encodeURIComponent(apiKey)}&apiUrl=${encodeURIComponent(apiUrl)}`
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
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const uploadSingleImage = useCallback(async (imageId: string, file: File) => {
    // Mark as uploading
    setImages((prev) =>
      prev.map((img) =>
        img.id === imageId ? { ...img, uploading: true, uploadError: undefined } : img
      )
    );

    try {
      // Compress image if needed (only compress if file > 1.5MB)
      const compressedFile = await compressImage(file);

      const formData = new FormData();
      formData.append('file', compressedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || '上传失败');
      }

      const data = await response.json();

      // Mark as uploaded successfully
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? { ...img, uploading: false, uploaded: true, storageUrl: data.url, storageKey: data.key }
            : img
        )
      );
    } catch (error) {
      // Mark as upload failed
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? { ...img, uploading: false, uploaded: false, uploadError: error instanceof Error ? error.message : '上传失败' }
            : img
        )
      );
    }
  }, []);

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
        uploaded: false,
      }));

    setImages((prev) => [...prev, ...newImages]);

    // Immediately start uploading each image
    newImages.forEach((img) => {
      uploadSingleImage(img.id, img.file);
    });
  }, [uploadSingleImage]);

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

  const startGeneration = useCallback(async () => {
    // Only use successfully uploaded images, keep track of original indices
    const uploadedEntries = images
      .map((img, idx) => ({ img, idx }))
      .filter((e) => e.img.uploaded && e.img.storageUrl);
    const failedUploads = images.filter((img) => img.uploadError);
    const stillUploading = images.filter((img) => img.uploading);

    if (stillUploading.length > 0) {
      throw new Error(`还有 ${stillUploading.length} 张图片正在上传中，请等待上传完成`);
    }

    if (uploadedEntries.length === 0) {
      throw new Error('没有已上传成功的图片，请重新添加图片');
    }

    if (!prompt.trim()) {
      throw new Error('请输入提示词');
    }

    const apiKey = localStorage.getItem('apimart_api_key') || '';
    if (!apiKey) {
      throw new Error('请先在右上角设置中配置 API Key');
    }
    const apiUrl = localStorage.getItem('apimart_api_url') || 'https://api.manxiaobai.online/v1';

    abortRef.current = false;
    setIsGenerating(true);
    setResults([]);
    setProgress(null);
    setError(null);

    try {
      if (failedUploads.length > 0) {
        console.warn(`${failedUploads.length} 张图片上传失败，将跳过`);
      }
      console.log(`开始生成，共 ${uploadedEntries.length} 张图片（同步模式）`);

      // 同步调用 - 直接返回结果
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          items: uploadedEntries.map((e) => ({ imageUrl: e.img.storageUrl, index: e.idx, originalName: e.img.file.name })),
          prompt: prompt.trim(),
          aspectRatio,
          resolution: resolution.toLowerCase(),
          size: aspectRatio,
          model: 'gpt-image-2',
          strength: 0.5,
          apiUrl,
        }),
      });

      if (!response.ok) {
        let errMsg = '生成失败';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `请求失败 (${response.status})`;
        }
        throw new Error(errMsg);
      }

      const total = uploadedEntries.length;
      const newResults: GenerationResult[] = [];

      // 读取 SSE 流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              console.log('[SSE event]', event.type, event.type === 'result' ? `index=${event.index} url=${event.imageUrl?.substring(0, 60)}...` : '');

              if (event.type === 'progress') {
                setProgress({ current: event.current, total: event.total });
              } else if (event.type === 'result') {
                newResults.push({
                  index: event.index,
                  success: true,
                  imageUrl: event.imageUrl,
                  originalName: event.originalName,
                });
                setResults([...newResults]);
              } else if (event.type === 'error') {
                newResults.push({
                  index: event.index,
                  success: false,
                  error: event.error || '生成失败',
                });
                setResults([...newResults]);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      setProgress({ current: total, total });
    } catch (error) {
      console.error('Generation error:', error);
      const errMsg = error instanceof Error ? error.message : '生成失败，请重试';
      setError(errMsg);
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
        throw new Error('请先在右上角设置中配置 API Key');
      }
      const apiUrl = localStorage.getItem('apimart_api_url') || 'https://api.manxiaobai.online/v1';

      // 同步调用 - 和主生成逻辑一样
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          items: failedImages.map((img, i) => ({ imageUrl: img.storageUrl, index: failedIndices[i], originalName: img.file.name })),
          prompt: prompt.trim(),
          aspectRatio,
          resolution: resolution.toLowerCase(),
          size: aspectRatio,
          model: 'gpt-image-2',
          strength: 0.5,
          apiUrl,
        }),
      });

      if (!response.ok) {
        let errMsg = '重试失败';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {
          errMsg = `请求失败 (${response.status})`;
        }
        throw new Error(errMsg);
      }

      // 读取 SSE 流式响应
      const retryReader = response.body?.getReader();
      const retryDecoder = new TextDecoder();
      let retryBuffer = '';

      if (retryReader) {
        while (true) {
          const { done, value } = await retryReader.read();
          if (done) break;

          retryBuffer += retryDecoder.decode(value, { stream: true });
          const lines = retryBuffer.split('\n');
          retryBuffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === 'result') {
                setResults((prev) => {
                  const filtered = prev.filter((x) => x.index !== event.index);
                  return [...filtered, { index: event.index, success: true, imageUrl: event.imageUrl }];
                });
              } else if (event.type === 'error') {
                setResults((prev) => {
                  const filtered = prev.filter((x) => x.index !== event.index);
                  return [...filtered, { index: event.index, success: false, error: event.error || '生成失败' }];
                });
              }
            } catch {
              // skip malformed SSE line
            }
          }
        }
      }
    } catch (error) {
      console.error('Retry generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [results, images, prompt, resolution, aspectRatio]);

  const retryUpload = useCallback(async (imageId: string) => {
    const image = images.find((img) => img.id === imageId);
    if (!image || !image.uploadError) return;

    // Clear error and mark as uploading
    setImages((prev) =>
      prev.map((img) =>
        img.id === imageId
          ? { ...img, uploading: true, uploadError: undefined }
          : img
      )
    );

    const formData = new FormData();
    formData.append('file', image.file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '上传失败');

      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? { ...img, uploading: false, uploaded: true, storageUrl: data.url, uploadError: undefined }
            : img
        )
      );
    } catch (err) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId
            ? { ...img, uploading: false, uploaded: false, uploadError: err instanceof Error ? err.message : '上传失败' }
            : img
        )
      );
    }
  }, [images]);

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
    error,
    clearError: () => setError(null),
    addImages,
    removeImage,
    clearImages,
    startGeneration,
    retryFailedGeneration,
    retryUpload,
  };
}
