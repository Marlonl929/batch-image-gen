'use client';

import type { UploadedImage, GenerationResult, GenerationProgress } from '@/hooks/use-image-generation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, CheckCircle2, XCircle, Loader2, Image as ImageIcon } from 'lucide-react';

interface ResultGalleryProps {
  images: UploadedImage[];
  results: GenerationResult[];
  progress: GenerationProgress | null;
  isGenerating: boolean;
}

export function ResultGallery({ images, results, progress, isGenerating }: ResultGalleryProps) {
  const hasResults = results.length > 0;
  const successResults = results.filter((r) => r.success);

  const downloadImage = async (url: string, filename: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  };

  const downloadAll = async () => {
    for (let i = 0; i < successResults.length; i++) {
      const result = successResults[i];
      if (result.imageUrl) {
        await downloadImage(result.imageUrl, `generated_${i + 1}.png`);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  };

  if (!hasResults && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
        <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm">Generated images will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-amber-500" />
          Results
          {hasResults && (
            <span className="text-zinc-500">
              ({successResults.length}/{results.length})
            </span>
          )}
        </h2>
        {successResults.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={downloadAll}
            className="text-amber-500 hover:text-amber-400"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download All
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {isGenerating && progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
              Processing...
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
        {results.map((result) => {
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
                    alt="Source"
                    className="w-full aspect-video object-cover opacity-60"
                  />
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-zinc-400">
                    Source
                  </div>
                </div>
              )}

              {/* Result */}
              {result.success && result.imageUrl ? (
                <div className="relative group">
                  <img
                    src={result.imageUrl}
                    alt="Generated"
                    className="w-full aspect-video object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        downloadImage(result.imageUrl!, `generated_${result.index + 1}.png`)
                      }
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download
                    </Button>
                  </div>
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-900/80 text-[10px] text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Done
                  </div>
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center bg-zinc-900">
                  <div className="text-center">
                    <XCircle className="h-6 w-6 text-red-400 mx-auto mb-1" />
                    <p className="text-xs text-red-400 max-w-[200px] truncate">
                      {result.error || 'Failed'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
