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
          Source Images
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
            Clear All
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
          Drag & drop images here, or <span className="text-amber-500">click to browse</span>
        </p>
        <p className="text-xs text-zinc-600 mt-1">
          Supports JPEG, PNG, WebP, GIF (max 10MB each)
        </p>
      </div>

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {images.map((image) => (
            <div
              key={image.id}
              className="group relative aspect-square rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800"
            >
              <img
                src={image.previewUrl}
                alt={image.file.name}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />

              {/* Upload error overlay */}
              {image.uploadError && (
                <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                </div>
              )}

              {/* Uploading overlay */}
              {image.uploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Delete button */}
              {!disabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(image.id);
                  }}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 flex items-center justify-center
                    opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadCount > 0 && (
        <p className="text-xs text-red-400">
          {uploadCount} image(s) failed to upload
        </p>
      )}
    </div>
  );
}
