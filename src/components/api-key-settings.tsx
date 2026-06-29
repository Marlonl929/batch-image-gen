'use client';

import { useState, useEffect } from 'react';
import { Settings, Key, Check, AlertCircle, Eye, EyeOff, Globe } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';

const STORAGE_KEY_API_KEY = 'apimart_api_key';
const STORAGE_KEY_API_URL = 'apimart_api_url';
const DEFAULT_API_URL = 'https://ncp.hayoz.top';

export function ApiKeySettings() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [savedKey, setSavedKey] = useState('');
  const [savedUrl, setSavedUrl] = useState(DEFAULT_API_URL);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem(STORAGE_KEY_API_KEY) || '';
    const url = localStorage.getItem(STORAGE_KEY_API_URL) || DEFAULT_API_URL;
    setSavedKey(key);
    setSavedUrl(url);
    setApiUrl(url);
  }, [open]);

  const handleSave = () => {
    const trimmedKey = apiKey.trim();
    const trimmedUrl = apiUrl.trim().replace(/\/+$/, ''); // Remove trailing slashes
    if (trimmedKey) {
      localStorage.setItem(STORAGE_KEY_API_KEY, trimmedKey);
      setSavedKey(trimmedKey);
    }
    localStorage.setItem(STORAGE_KEY_API_URL, trimmedUrl || DEFAULT_API_URL);
    setSavedUrl(trimmedUrl || DEFAULT_API_URL);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    localStorage.removeItem(STORAGE_KEY_API_URL);
    setApiKey('');
    setSavedKey('');
    setApiUrl(DEFAULT_API_URL);
    setSavedUrl(DEFAULT_API_URL);
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
            <Settings className="h-4 w-4 text-amber-500" />
            API 设置
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            配置 API 地址和密钥，保存在浏览器本地，不会上传到服务器。
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
                <span>已配置：{savedKey.slice(0, 8)}...{savedKey.slice(-4)}</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5" />
                <span>未配置 API Key，请先设置</span>
              </>
            )}
          </div>

          {/* API URL Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              API 地址
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://ncp.hayoz.top"
              className="w-full h-10 px-3 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            />
            <p className="text-xs text-zinc-600">
              默认：https://ncp.hayoz.top，可替换为其他兼容接口地址
            </p>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5" />
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={savedKey ? '已保存，留空则保持不变' : 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
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
              disabled={!apiKey.trim() && !savedKey}
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
                清除全部
              </button>
            )}
          </div>

          {/* Help text */}
          <p className="text-xs text-zinc-600">
            API 地址和密钥仅存储在浏览器 localStorage 中，每次请求时发送到后端用于调用图生图服务。
            默认使用 ncp.hayoz.top 异步生图接口。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
