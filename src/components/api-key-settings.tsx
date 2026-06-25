'use client';

import { useState, useEffect } from 'react';
import { Settings, Key, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';

const STORAGE_KEY = 'apimart_api_key';

export function ApiKeySettings() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem(STORAGE_KEY) || '';
    setSavedKey(key);
  }, [open]);

  const handleSave = () => {
    const trimmed = apiKey.trim();
    localStorage.setItem(STORAGE_KEY, trimmed);
    setSavedKey(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey('');
    setSavedKey('');
  };

  const isConfigured = savedKey.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="relative h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-zinc-800 group"
          title="API 设置"
        >
          <Settings className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          {!isConfigured && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Key className="h-4 w-4 text-amber-500" />
            API 密钥设置
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            输入你的 APIMart API Key，保存在浏览器本地，不会上传到服务器。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status indicator */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
            isConfigured
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {isConfigured ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>已配置 API Key：{savedKey.slice(0, 8)}...{savedKey.slice(-4)}</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5" />
                <span>未配置 API Key，请先设置</span>
              </>
            )}
          </div>

          {/* Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">APIMart API Key</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full h-10 px-3 pr-10 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="flex-1 h-9 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              {saved ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  已保存
                </>
              ) : (
                '保存'
              )}
            </button>
            {isConfigured && (
              <button
                onClick={handleClear}
                className="h-9 px-4 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-400 text-sm transition-colors"
              >
                清除
              </button>
            )}
          </div>

          {/* Help text */}
          <p className="text-xs text-zinc-600">
            API Key 仅存储在浏览器 localStorage 中，每次请求时随数据发送到后端用于调用 APIMart 服务。
            请确保在可信环境下使用。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
