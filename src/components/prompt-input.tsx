'use client';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2 } from 'lucide-react';
import { RESOLUTIONS, ASPECT_RATIOS, calculateSize } from '@/hooks/use-image-generation';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  resolution: string;
  onResolutionChange: (value: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  imageCount: number;
  isGenerating: boolean;
  onGenerate: () => void;
}

export function PromptInput({
  prompt,
  onPromptChange,
  resolution,
  onResolutionChange,
  aspectRatio,
  onAspectRatioChange,
  imageCount,
  isGenerating,
  onGenerate,
}: PromptInputProps) {
  const canGenerate = imageCount > 0 && prompt.trim().length > 0 && !isGenerating;
  const sizePreview = calculateSize(resolution, aspectRatio);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        {'\u63d0\u793a\u8bcd & \u53c2\u6570\u8bbe\u7f6e'}
      </h2>

      <div className="space-y-2">
        <Label htmlFor="prompt" className="text-zinc-400 text-xs">
          {'\u63cf\u8ff0\u4f60\u60f3\u8981\u7684\u98ce\u683c\u548c\u6548\u679c'}
        </Label>
        <Textarea
          id="prompt"
          placeholder={'\u4f8b\u5982\uff1a\u8f6c\u6362\u4e3a\u5409\u535c\u529b\u52a8\u753b\u98ce\u683c\uff0c\u4fdd\u6301\u4eba\u7269\u7279\u5f81\uff0c\u6dfb\u52a0\u67d4\u548c\u5149\u7ebf\u548c\u68a6\u5e7b\u6c1b\u56f4...'}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isGenerating}
          rows={4}
          className="bg-zinc-900/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 resize-none focus:border-amber-500/50 focus:ring-amber-500/20"
        />
      </div>

      {/* Resolution + Aspect Ratio */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-zinc-400 text-xs">{'\u5206\u8fa8\u7387'}</Label>
          <Select value={resolution} onValueChange={onResolutionChange} disabled={isGenerating}>
            <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-zinc-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {Object.entries(RESOLUTIONS).map(([key, val]) => (
                <SelectItem key={key} value={key}>
                  {val.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-zinc-400 text-xs">{'\u5bbd\u9ad8\u6bd4'}</Label>
          <Select value={aspectRatio} onValueChange={onAspectRatioChange} disabled={isGenerating}>
            <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-zinc-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              {Object.entries(ASPECT_RATIOS).map(([key, val]) => (
                <SelectItem key={key} value={key}>
                  {val.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Size preview */}
      <div className="text-xs text-zinc-500">
        {'\u8f93\u51fa\u5c3a\u5bf8'}: <span className="text-zinc-300">{sizePreview}</span> px
      </div>

      <Button
        onClick={onGenerate}
        disabled={!canGenerate}
        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium h-11 transition-all"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {'\u751f\u6210\u4e2d...'}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            {imageCount > 0 ? `\u5f00\u59cb\u751f\u6210 (${imageCount} \u5f20)` : '\u5f00\u59cb\u751f\u6210'}
          </>
        )}
      </Button>
    </div>
  );
}
