import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_API_URL = 'https://ncp.hayoz.top/v1';
const CONCURRENCY = 100; // 并发数（API 已提升至 100）
const MAX_RETRIES = 3; // 429 错误最多重试 3 次
const RETRY_DELAY = 2000; // 重试间隔 2 秒

// 通过 magic bytes 检测图片真实格式
function detectImageFormat(buffer: Uint8Array): { ext: string; mime: string } {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { ext: 'gif', mime: 'image/gif' };
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  // 默认 PNG
  return { ext: 'png', mime: 'image/png' };
}

// 延时函数
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 处理单张图片
async function processSingleImage(
  item: { imageUrl: string; index: number },
  idx: number,
  prompt: string,
  size: string,
  model: string,
  apiUrl: string,
  apiKey: string
): Promise<{
  index: number;
  status: 'completed' | 'failed';
  imageUrl?: string;
  revisedPrompt?: string;
  error?: string;
}> {
  try {
    // 下载原始图片
    const imageResponse = await fetch(item.imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`下载图片失败: ${imageResponse.status}`);
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const headerBytes = new Uint8Array(imageBuffer.slice(0, 4));
    const { ext, mime } = detectImageFormat(headerBytes);

    // 创建正确的 File 对象（MIME 类型和扩展名匹配）
    const file = new File([imageBuffer], `image.${ext}`, { type: mime });

    // 构建 multipart/form-data
    const formData = new FormData();
    formData.append('model', model || 'gpt-image-2');
    formData.append('prompt', prompt || '');
    formData.append('size', size);
    formData.append('response_format', 'url');
    formData.append('image', file);

    // 带重试的 API 调用（处理 429 并发限制）
    let lastError = '';
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(`${apiUrl}/images/edits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0 && data.data[0].url) {
          return {
            index: item.index,
            status: 'completed' as const,
            imageUrl: data.data[0].url,
            revisedPrompt: data.data[0].revised_prompt,
          };
        } else {
          console.error(`[generate] 图片 ${idx} 返回数据异常:`, JSON.stringify(data).slice(0, 300));
          return {
            index: item.index,
            status: 'failed' as const,
            error: 'API 返回数据格式异常',
          };
        }
      }

      const errorText = await response.text();
      lastError = `API 返回 ${response.status}: ${errorText.slice(0, 200)}`;

      // 429 并发限制 → 等待后重试
      if (response.status === 429) {
        const delay = RETRY_DELAY * (attempt + 1); // 递增延迟：2s, 4s, 6s
        console.warn(`[generate] 图片 ${idx} 触发并发限制 (429)，${delay}ms 后重试 (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }

      // 非 429 错误直接返回失败
      console.error(`[generate] 图片 ${idx} API 错误:`, response.status, errorText);
      return {
        index: item.index,
        status: 'failed' as const,
        error: lastError,
      };
    }

    // 重试耗尽
    console.error(`[generate] 图片 ${idx} 重试 ${MAX_RETRIES} 次后仍失败`);
    return {
      index: item.index,
      status: 'failed' as const,
      error: `${lastError}（已重试 ${MAX_RETRIES} 次）`,
    };
  } catch (error) {
    console.error(`[generate] 图片 ${idx} 处理失败:`, error);
    return {
      index: item.index,
      status: 'failed' as const,
      error: error instanceof Error ? error.message : '处理失败',
    };
  }
}

// 分批处理图片（控制并发数）
async function processInBatches(
  items: { imageUrl: string; index: number }[],
  prompt: string,
  size: string,
  model: string,
  apiUrl: string,
  apiKey: string
) {
  const allResults: Awaited<ReturnType<typeof processSingleImage>>[] = [];

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    console.log(`[generate] 处理批次 ${Math.floor(i / CONCURRENCY) + 1}: 图片 ${batch.map(b => b.index).join(', ')}`);

    const batchResults = await Promise.all(
      batch.map((item, batchIdx) =>
        processSingleImage(item, i + batchIdx, prompt, size, model, apiUrl, apiKey)
      )
    );

    allResults.push(...batchResults);
  }

  return allResults;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, prompt, aspectRatio, resolution, size: sizeParam, model, strength, apiUrl: clientApiUrl } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '请提供至少一张图片' }, { status: 400 });
    }

    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: '缺少 API Key' }, { status: 401 });
    }

    const apiUrl = (clientApiUrl || DEFAULT_API_URL).replace(/\/+$/, '');

    // 计算图片尺寸
    let size = '1024x1024';
    if (sizeParam && typeof sizeParam === 'string') {
      if (sizeParam.includes('x')) {
        size = sizeParam;
      } else {
        const sizeMap: Record<string, string> = {
          '1:1': '1024x1024',
          '16:9': '1344x768',
          '9:16': '768x1344',
          '4:3': '1152x896',
          '3:4': '896x1152',
          '3:2': '1216x832',
          '2:3': '832x1216',
          '21:9': '1536x640',
        };
        size = sizeMap[sizeParam] || '1024x1024';
      }
    }

    console.log(`[generate] 开始处理 ${items.length} 张图片, 并发数: ${CONCURRENCY}, 尺寸: ${size}`);

    // 分批处理
    const results = await processInBatches(items, prompt || '', size, model || 'gpt-image-2', apiUrl, apiKey);

    // 分类成功和失败的结果
    const completedResults = results.filter(
      (r) => r.status === 'completed'
    );
    const failedResults = results.filter(
      (r) => r.status === 'failed'
    );

    console.log(`[generate] 处理完成: ${completedResults.length} 成功, ${failedResults.length} 失败`);

    return NextResponse.json({
      results: completedResults,
      errors: failedResults,
    });
  } catch (error) {
    console.error('[generate] 处理失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '处理失败' },
      { status: 500 }
    );
  }
}
