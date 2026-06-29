'use client';

import { useCallback, useRef, useState } from 'react';
import type { UploadedImage } from '@/hooks/use-image-generation';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon, AlertCircle, Loader2, Check, RefreshCw } from 'lucide-react';

interface ImageUploaderProps {
  images: UploadedImage[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onRetryUpload: (id: string) => void;
  disabled: boolean;
}

export function ImageUploader({ images, onAdd, onRemove, onClear, onRetryUpload, disabled }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      if (e.dataTransfer.files.length > 0) {
        onAdd(e.dataTransfer.files);
      }
    },
    [onAdd, disabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAdd(e.target.files);
      e.target.value = '';
    }
  };

  const uploadedCount = images.filter((img) => img.uploaded && !img.uploading).length;
  const uploadingCount = images.filter((img) => img.uploading).length;
  const errorCount = images.filter((img) => img.uploadError).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-amber-500" />
          原始图片
          <span className="text-zinc-500">({images.length})</span>
          {uploadingCount > 0 && (
            <span className="text-amber-400 text-xs flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {uploadingCount} 张上传中
            </span>
          )}
          {uploadedCount > 0 && (
            <span className="text-emerald-400 text-xs">✓ {uploadedCount} 张已上传</span>
          )}
          {errorCount > 0 && (
            <span className="text-red-400 text-xs">✗ {errorCount} 张失败</span>
          )}
        </h2>
        {images.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            className="text-zinc-400 hover:text-zinc-200"
          >
            清空全部
          </Button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`
          relative cursor-pointer rounded-lg border-2 border-dashed
          transition-all duration-200
          ${isDragOver
            ? 'border-amber-500 bg-amber-500/10'
            : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-900'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          p-6 text-center
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={handleChange}
          className="hidden"
        />
        <Upload className={`mx-auto h-8 w-8 mb-2 ${isDragOver ? 'text-amber-500' : 'text-zinc-500'}`} />
        <p className="text-sm text-zinc-400">
          拖拽图片到这里，或 <span className="text-amber-500">点击浏览</span>
        </p>
        <p className="text-xs text-zinc-600 mt-1">
          支持 JPEG、PNG、WebP、GIF 格式（单张最大 10MB）
        </p>
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="max-h-[320px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className={`group relative aspect-square rounded-md overflow-hidden bg-zinc-900 border transition-colors ${
                  image.uploadError
                    ? 'border-red-500/50'
                    : image.uploading
                    ? 'border-amber-500/50'
                    : image.uploaded
                    ? 'border-emerald-500/30'
                    : 'border-zinc-800 hover:border-amber-500/50'
                }`}
              >
                <img
                  src={image.previewUrl}
                  alt={image.file.name}
                  className="h-full w-full object-cover"
                />
                {/* Uploading */}
                {image.uploading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                    <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />
                    <span className="text-[10px] text-amber-400">上传中</span>
                  </div>
                )}
                {/* Upload success */}
                {image.uploaded && !image.uploading && (
                  <div className="absolute bottom-0.5 left-0.5 h-4 w-4 rounded-full bg-emerald-600 flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
                {/* Upload error */}
                {image.uploadError && (
                  <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center gap-1">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRetryUpload(image.id);
                      }}
                      className="flex items-center gap-0.5 text-[10px] text-red-300 hover:text-red-100 transition-colors"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      重试
                    </button>
                  </div>
                )}
                {/* Remove button */}
                {!disabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(image.id);
                    }}
                    className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/70 flex items-center justify-center
                    opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X className="h-2.5 w-2.5 text-white" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
