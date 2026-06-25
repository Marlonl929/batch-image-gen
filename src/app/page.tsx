'use client';

import { ImageUploader } from '@/components/image-uploader';
import { PromptInput } from '@/components/prompt-input';
import { ResultGallery } from '@/components/result-gallery';
import { useImageGeneration } from '@/hooks/use-image-generation';
import { Layers } from 'lucide-react';

export default function Home() {
  const {
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
  } = useImageGeneration();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Layers className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
              Batch Image Transformer
            </h1>
            <p className="text-xs text-zinc-500">
              Upload images, describe your vision, generate in batch
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Upload area */}
          <div className="lg:col-span-7 space-y-6">
            <ImageUploader
              images={images}
              onAdd={addImages}
              onRemove={removeImage}
              onClear={clearImages}
              disabled={isGenerating}
            />

            {/* Results */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
              <ResultGallery
                images={images}
                results={results}
                progress={progress}
                isGenerating={isGenerating}
              />
            </div>
          </div>

          {/* Right: Prompt & settings */}
          <div className="lg:col-span-5">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5 sticky top-24">
              <PromptInput
                prompt={prompt}
                onPromptChange={setPrompt}
                size={size}
                onSizeChange={setSize}
                imageCount={images.length}
                isGenerating={isGenerating}
                onGenerate={startGeneration}
              />

              {/* Tips */}
              <div className="mt-6 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800/50">
                <p className="text-xs text-zinc-500 font-medium mb-2">Tips</p>
                <ul className="text-xs text-zinc-600 space-y-1">
                  <li>- Be specific about the style (e.g., watercolor, oil painting, anime)</li>
                  <li>- Mention what to preserve from the original image</li>
                  <li>- Describe lighting, mood, and atmosphere</li>
                  <li>- Images are processed with concurrency of 2</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
