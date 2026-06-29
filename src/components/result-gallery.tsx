'use client';

import { useState } from 'react';
import JSZip from 'jszip';
import type { UploadedImage, GenerationResult, GenerationProgress } from '@/hooks/use-image-generation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, CheckCircle2, XCircle, Loader2, Image as ImageIcon, ZoomIn, X, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface ResultGalleryProps {
  images: UploadedImage[];
  results: GenerationResult[];
  progress: GenerationProgress | null;
  isGenerating: boolean;
  onRetryFailed?: () => void;
  prompt?: string;
}

export function ResultGallery({ images, results, progress, isGenerating, onRetryFailed, prompt }: ResultGalleryProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  // 按原始图片索引排序，确保结果与原图一一对应
  const sortedResults = [...results].sort((a, b) => a.index - b.index);
  const hasResults = sortedResults.length > 0;
  const successResults = sortedResults.filter((r) => r.success);
  const failedResults = sortedResults.filter((r) => !r.success);

  const downloadImage = async (url: string, filename: string) => {
    try {
      // 优先通过后端代理下载（避免 CORS 问题）
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('Proxy download failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      // 代理失败时，直接在新标签页打开图片
      window.open(url, '_blank');
    }
  };

  const downloadAll = async () => {
    if (successResults.length === 0) return;
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < successResults.length; i++) {
        const result = successResults[i];
        if (result.imageUrl) {
          try {
            const proxyUrl = `/api/download?url=${encodeURIComponent(result.imageUrl)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
              const blob = await response.blob();
              zip.file(`生成结果_${i + 1}.png`, blob);
            }
          } catch {
            // skip failed downloads
          }
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `生成结果_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(zipUrl);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!hasResults && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
        <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm">{'\u751f\u6210\u7684\u56fe\u7247\u5c06\u5728\u8fd9\u91cc\u663e\u793a'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-amber-500" />
          {'\u751f\u6210\u7ed3\u679c'}
          {hasResults && (
            <span className="text-zinc-500">
              ({successResults.length}/{sortedResults.length})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {failedResults.length > 0 && onRetryFailed && !isGenerating && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetryFailed}
              className="text-orange-500 hover:text-orange-400"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              重新生成失败结果 ({failedResults.length})
            </Button>
          )}
          {successResults.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadAll}
              disabled={isDownloading}
              className="text-amber-500 hover:text-amber-400"
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isDownloading ? '打包中...' : '打包下载'}
            </Button>
          )}
        </div>
      </div>

      {/* Prompt display */}
      {prompt && hasResults && (
        <div className="px-3 py-2 rounded-lg bg-zinc-800/40 border border-zinc-800/50">
          <p className="text-xs text-zinc-500 mb-1">{'\u63d0\u793a\u8bcd'}</p>
          <p className="text-sm text-zinc-300 leading-relaxed">{prompt}</p>
        </div>
      )}

      {/* Progress bar */}
      {isGenerating && progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
              {'\u5904\u7406\u4e2d...'}
            </span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <Progress
            value={(progress.current / progress.total) * 100}
            className="h-1.5 bg-zinc-800"
          />
        </div>
      )}

      {/* Results grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedResults.map((result) => {
          const sourceImage = images[result.index];
          return (
            <div
              key={result.index}
              className="rounded-lg overflow-hidden bg-zinc-900/50 border border-zinc-800"
            >
              {/* Source image */}
              {sourceImage && (
                <div className="relative">
                  <img
                    src={sourceImage.previewUrl}
                    alt={'\u539f\u56fe'}
                    className="w-full aspect-video object-cover opacity-60"
                  />
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-zinc-400">
                    {'\u539f\u56fe'}
                  </div>
                </div>
              )}

              {/* Result */}
              {result.success && result.imageUrl ? (
                <div className="relative group">
                  <img
                    src={result.imageUrl}
                    alt={'\u751f\u6210\u7ed3\u679c'}
                    className="w-full aspect-video object-cover cursor-pointer"
                    onClick={() => setPreviewUrl(result.imageUrl!)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewUrl(result.imageUrl!);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ZoomIn className="h-3.5 w-3.5 mr-1" />
                      {'\u9884\u89c8'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadImage(result.imageUrl!, `\u751f\u6210\u7ed3\u679c_${result.index + 1}.png`);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      {'\u4e0b\u8f7d'}
                    </Button>
                  </div>
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-900/80 text-[10px] text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    {'\u5df2\u5b8c\u6210'}
                  </div>
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center bg-zinc-900">
                  <div className="text-center">
                    <XCircle className="h-6 w-6 text-red-400 mx-auto mb-1" />
                    <p className="text-xs text-red-400 max-w-[200px] truncate">
                      {result.error || '\u751f\u6210\u5931\u8d25'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Image preview lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={previewUrl}
            alt={'\u9884\u89c8'}
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
