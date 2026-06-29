import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_API_URL = 'https://ncp.hayoz.top/v1';
const CONCURRENCY = 5; // 并发数，避免服务器过载导致 524 超时
const MAX_RETRIES = 3; // 可重试错误最多重试 3 次
const RETRY_DELAY = 3000; // 重试基础间隔 3 秒
const BATCH_DELAY = 1000; // 批次间间隔 1 秒

// 可重试的 HTTP 状态码
const RETRYABLE_STATUS = new Set([429, 524, 502, 503, 504]);

// 检测无效的图片 URL（localhost / 127.0.0.1 / 内网地址）
function isInvalidImageUrl(url: string): boolean {
  const invalid = [
    '127.0.0.1',
    'localhost',
    '0.0.0.0',
    '192.168.',
    '10.',
    '172.16.',
    '172.17.',
    '172.18.',
    '172.19.',
    '172.20.',
    '172.21.',
    '172.22.',
    '172.23.',
    '172.24.',
    '172.25.',
    '172.26.',
    '172.27.',
    '172.28.',
    '172.29.',
    '172.30.',
    '172.31.',
  ];
  const lower = url.toLowerCase();
  return invalid.some(prefix => lower.includes(prefix));
}

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
  return { ext: 'png', mime: 'image/png' };
}

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

    const file = new File([imageBuffer], `image.${ext}`, { type: mime });

    // 构建 multipart/form-data
    const formData = new FormData();
    formData.append('model', model || 'gpt-image-2');
    formData.append('prompt', prompt || '');
    formData.append('size', size);
    formData.append('response_format', 'url');
    formData.append('image', file);

    // 带重试的 API 调用
    let lastError = '';
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
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
            const imageUrl = data.data[0].url;

            // 检测无效 URL（localhost / 内网地址）
            if (isInvalidImageUrl(imageUrl)) {
              console.warn(`[generate] 图片 ${idx} API 返回无效地址: ${imageUrl}`);
              lastError = 'API 返回了无效的图片地址（内网/本地地址），请重试';
              // 当作可重试错误处理
              const delay = RETRY_DELAY * (attempt + 1);
              console.warn(`[generate] 图片 ${idx} 无效地址，${delay}ms 后重试 (${attempt + 1}/${MAX_RETRIES})`);
              await sleep(delay);
              continue;
            }

            return {
              index: item.index,
              status: 'completed' as const,
              imageUrl,
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

        // 可重试状态码 → 等待后重试
        if (RETRYABLE_STATUS.has(response.status)) {
          const delay = RETRY_DELAY * (attempt + 1);
          console.warn(`[generate] 图片 ${idx} 遇到 ${response.status}，${delay}ms 后重试 (${attempt + 1}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }

        // 不可重试的错误直接返回失败
        console.error(`[generate] 图片 ${idx} API 错误:`, response.status, errorText);
        return {
          index: item.index,
          status: 'failed' as const,
          error: lastError,
        };
      } catch (fetchError) {
        // fetch 本身失败（网络错误、DNS 解析失败等）
        lastError = fetchError instanceof Error ? fetchError.message : '网络请求失败';
        const delay = RETRY_DELAY * (attempt + 1);
        console.warn(`[generate] 图片 ${idx} 网络错误: ${lastError}，${delay}ms 后重试 (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
      }
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

// 分批处理图片
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

    // 批次间间隔，给服务器喘息时间
    if (i + CONCURRENCY < items.length) {
      await sleep(BATCH_DELAY);
    }
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

    // 分类结果
    const completedResults = results.filter((r) => r.status === 'completed');
    const failedResults = results.filter((r) => r.status === 'failed');

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
