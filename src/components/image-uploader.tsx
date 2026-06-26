'use client';

import { useCallback, useRef, useState } from 'react';
import type { UploadedImage } from '@/hooks/use-image-generation';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react';

interface ImageUploaderProps {
  images: UploadedImage[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  disabled: boolean;
}

export function ImageUploader({ images, onAdd, onRemove, onClear, disabled }: ImageUploaderProps) {
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

  const uploadCount = images.filter((img) => img.uploadError).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-amber-500" />
          {'\u539f\u59cb\u56fe\u7247'}
          <span className="text-zinc-500">({images.length})</span>
        </h2>
        {images.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={disabled}
            className="text-zinc-400 hover:text-zinc-200"
          >
            {'\u6e05\u7a7a\u5168\u90e8'}
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
          {'\u62d6\u62fd\u56fe\u7247\u5230\u8fd9\u91cc\uff0c\u6216'} <span className="text-amber-500">{'\u70b9\u51fb\u6d4f\u89c8'}</span>
        </p>
        <p className="text-xs text-zinc-600 mt-1">
          {'\u652f\u6301 JPEG\u3001PNG\u3001WebP\u3001GIF \u683c\u5f0f\uff08\u5355\u5f20\u6700\u5927 10MB\uff09'}
        </p>
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="max-h-[320px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className="group relative aspect-square rounded-md overflow-hidden bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 transition-colors"
              >
                <img
                  src={image.previewUrl}
                  alt={image.file.name}
                  className="h-full w-full object-cover"
                />
                {image.uploadError && (
                  <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  </div>
                )}
                {image.uploading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
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

      {uploadCount > 0 && (
        <p className="text-xs text-red-400">
          {uploadCount} {'\u5f20\u56fe\u7247\u4e0a\u4f20\u5931\u8d25'}
        </p>
      )}
    </div>
  );
}
