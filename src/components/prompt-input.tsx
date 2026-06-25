'use client';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Loader2 } from 'lucide-react';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  size: string;
  onSizeChange: (value: string) => void;
  imageCount: number;
  isGenerating: boolean;
  onGenerate: () => void;
}

export function PromptInput({
  prompt,
  onPromptChange,
  size,
  onSizeChange,
  imageCount,
  isGenerating,
  onGenerate,
}: PromptInputProps) {
  const canGenerate = imageCount > 0 && prompt.trim().length > 0 && !isGenerating;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        Prompt & Settings
      </h2>

      <div className="space-y-2">
        <Label htmlFor="prompt" className="text-zinc-400 text-xs">
          Describe the style and transformation you want
        </Label>
        <Textarea
          id="prompt"
          placeholder="e.g., Transform into Studio Ghibli anime style, maintain character features, add soft lighting and dreamy atmosphere..."
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          disabled={isGenerating}
          rows={4}
          className="bg-zinc-900/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600 resize-none focus:border-amber-500/50 focus:ring-amber-500/20"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-400 text-xs">Output Size</Label>
        <Select value={size} onValueChange={onSizeChange} disabled={isGenerating}>
          <SelectTrigger className="bg-zinc-900/50 border-zinc-700 text-zinc-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-700">
            <SelectItem value="2K">2K (2048 x 1152)</SelectItem>
            <SelectItem value="4K">4K (4096 x 2304)</SelectItem>
            <SelectItem value="2560x1440">2560 x 1440</SelectItem>
            <SelectItem value="2560x2560">2560 x 2560 (Square)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={onGenerate}
        disabled={!canGenerate}
        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium h-11 transition-all"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate {imageCount > 0 ? `${imageCount} Image${imageCount > 1 ? 's' : ''}` : ''}
          </>
        )}
      </Button>
    </div>
  );
}
