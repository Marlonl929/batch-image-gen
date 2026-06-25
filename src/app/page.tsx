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
              {'\u6279\u91cf\u56fe\u751f\u56fe\u5de5\u5177'}
            </h1>
            <p className="text-xs text-zinc-500">
              {'\u4e0a\u4f20\u56fe\u7247\uff0c\u63cf\u8ff0\u4f60\u7684\u521b\u610f\uff0c\u6279\u91cf\u751f\u6210'}
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
                resolution={resolution}
                onResolutionChange={setResolution}
                aspectRatio={aspectRatio}
                onAspectRatioChange={setAspectRatio}
                imageCount={images.length}
                isGenerating={isGenerating}
                onGenerate={startGeneration}
              />

              {/* Tips */}
              <div className="mt-6 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800/50">
                <p className="text-xs text-zinc-500 font-medium mb-2">{'\u4f7f\u7528\u63d0\u793a'}</p>
                <ul className="text-xs text-zinc-600 space-y-1">
                  <li>{'- \u5c3d\u91cf\u5177\u4f53\u5730\u63cf\u8ff0\u98ce\u683c\uff08\u5982\u6c34\u5f69\u3001\u6cb9\u753b\u3001\u52a8\u6f2b\u98ce\u683c\uff09'}</li>
                  <li>{'- \u8bf4\u660e\u9700\u8981\u4fdd\u7559\u539f\u56fe\u7684\u54ea\u4e9b\u7279\u5f81'}</li>
                  <li>{'- \u63cf\u8ff0\u5149\u7ebf\u3001\u6c1b\u56f4\u548c\u60c5\u7eea'}</li>
                  <li>{'- \u56fe\u7247\u6309\u987a\u5e8f\u5904\u7406\uff0c\u6bcf\u6b21\u5e76\u884c 2 \u5f20'}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
