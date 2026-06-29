'use client';

import { useState } from 'react';
import { useGenerationHistory, type HistoryRecord } from '@/hooks/use-generation-history';
import { Button } from '@/components/ui/button';
import { Layers, History, ArrowLeft, Trash2, Clock, Image as ImageIcon, ZoomIn, X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import JSZip from 'jszip';

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

function getRemainingTime(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return '已过期';
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  if (hours < 1) return '不足1小时';
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}天${remHours}小时`;
}

function HistoryCard({ record, onDelete }: { record: HistoryRecord; onDelete: (id: string) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const successResults = record.results.filter((r) => r.success && r.imageUrl);
  const sortedResults = [...record.results].sort((a, b) => a.index - b.index);

  const downloadImage = async (url: string, filename: string) => {
    try {
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
              zip.file(`结果_${i + 1}.png`, blob);
            }
          } catch {
            // skip
          }
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `生成结果_${formatTime(record.createdAt).replace(/[\s:]/g, '-')}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(zipUrl);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        {/* Card header */}
        <div className="p-4 border-b border-zinc-800/50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 leading-relaxed line-clamp-2">
                {record.prompt}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(record.createdAt)}
                </span>
                <span>{record.aspectRatio}</span>
                <span>{record.resolution}</span>
                <span className="text-emerald-500">
                  {successResults.length}/{record.results.length} 成功
                </span>
                <span className="text-zinc-600">
                  剩余 {getRemainingTime(record.expiresAt)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {successResults.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadAll}
                  disabled={isDownloading}
                  className="text-amber-500 hover:text-amber-400 h-7 px-2"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(record.id)}
                className="text-zinc-500 hover:text-red-400 h-7 px-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Results grid */}
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {sortedResults.map((result, idx) => (
              <div
                key={idx}
                className="rounded-lg overflow-hidden bg-zinc-900/50 border border-zinc-800/50"
              >
                {result.success && result.imageUrl ? (
                  <div className="relative group cursor-pointer" onClick={() => setPreviewUrl(result.imageUrl!)}>
                    <img
                      src={result.sourcePreviewUrl || result.imageUrl}
                      alt="结果"
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square flex items-center justify-center bg-zinc-900">
                    <div className="text-center px-2">
                      <X className="h-4 w-4 text-red-400 mx-auto mb-0.5" />
                      <p className="text-[10px] text-red-400 truncate">
                        {result.error || '失败'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Preview lightbox */}
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
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-4 right-4"
            onClick={(e) => {
              e.stopPropagation();
              downloadImage(previewUrl, '生成结果.png');
            }}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            下载
          </Button>
          <img
            src={previewUrl}
            alt="预览"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

export default function HistoryPage() {
  const { history, deleteRecord, clearHistory } = useGenerationHistory();

  // Sort by newest first
  const sortedHistory = [...history].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors text-zinc-400 hover:text-zinc-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <History className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
              生成记录
            </h1>
            <p className="text-xs text-zinc-500">
              生成结果保留 72 小时
            </p>
          </div>
          {sortedHistory.length > 0 && (
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="text-zinc-500 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                清空记录
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {sortedHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
            <History className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">暂无生成记录</p>
            <Link
              href="/"
              className="mt-4 text-sm text-amber-500 hover:text-amber-400 transition-colors"
            >
              去生成图片
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedHistory.map((record) => (
              <HistoryCard
                key={record.id}
                record={record}
                onDelete={deleteRecord}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
