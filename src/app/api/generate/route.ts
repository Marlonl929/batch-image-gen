import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_API_URL = 'https://api.manxiaobai.online/v1';
const DEFAULT_MODEL = 'gpt-image-2';

// 分辨率 + 比例 → 尺寸映射表
const SIZE_MAP: Record<string, Record<string, string>> = {
  '1k': {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '16:9': '1824x1024',
    '9:16': '1024x1824',
    '4:3': '1360x1024',
    '3:4': '1024x1360',
    '21:9': '2384x1024',
  },
  '2k': {
    '1:1': '2048x2048',
    '3:2': '2048x1360',
    '2:3': '1360x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    '21:9': '2048x880',
  },
  '4k': {
    '1:1': '2880x2880',
    '3:2': '3520x2336',
    '2:3': '2336x3520',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '4:3': '3312x2480',
    '3:4': '2480x3312',
    '21:9': '3840x1648',
  },
};

function getModelAndSize(
  baseModel: string,
  aspectRatio: string,
  resolution: string
): { model: string; size: string } {
  const resKey = resolution.toLowerCase().replace('k', '') + 'k';
  const sizeFromMap = SIZE_MAP[resKey]?.[aspectRatio];

  // 如果模型名带档位后缀（如 gpt-image-2-2k），必须传对应尺寸
  const tierMatch = baseModel.match(/-(\dk)$/);
  if (tierMatch) {
    const tier = tierMatch[1];
    const tierSize = SIZE_MAP[tier]?.[aspectRatio];
    return {
      model: baseModel,
      size: tierSize || sizeFromMap || '1024x1024',
    };
  }

  // 裸名 gpt-image-2：用分辨率对应的尺寸
  if (sizeFromMap) {
    return { model: baseModel, size: sizeFromMap };
  }

  return { model: baseModel, size: '1024x1024' };
}

async function downloadImageAsBlob(url: string): Promise<{ blob: Blob; filename: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`下载图片失败: ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const contentType = resp.headers.get('content-type') || 'image/png';

  let ext = 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
  else if (contentType.includes('webp')) ext = 'webp';

  // 从 URL 推断扩展名
  const urlPath = url.split('?')[0].toLowerCase();
  if (urlPath.endsWith('.jpg') || urlPath.endsWith('.jpeg')) ext = 'jpg';
  else if (urlPath.endsWith('.webp')) ext = 'webp';

  const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const filename = `image.${ext}`;
  return { blob, filename };
}

async function submitAsyncTask(
  apiUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  size: string,
  imageBlob: Blob,
  filename: string
): Promise<string> {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('size', size);
  form.append('n', '1');
  form.append('response_format', 'url');
  form.append('image', imageBlob, filename);

  const resp = await fetch(`${apiUrl}/image-tasks/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`提交任务失败 (${resp.status}): ${errText.slice(0, 200)}`);
  }

  const data = await resp.json();
  if (!data.id) throw new Error(`提交任务失败: 未返回任务 ID`);
  return data.id;
}

async function pollTaskResult(
  apiUrl: string,
  apiKey: string,
  taskId: string,
  maxAttempts = 60
): Promise<{ url: string; revisedPrompt?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    const resp = await fetch(`${apiUrl}/image-tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`查询任务失败 (${resp.status}): ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();

    if (data.status === 'succeeded') {
      const imageUrl = data.result?.data?.[0]?.url || data.result?.data?.[0]?.b64_json;
      if (!imageUrl) throw new Error('任务成功但未返回图片');

      // 检查是否为无效的内网地址
      if (
        imageUrl.startsWith('http://127.0.0.1') ||
        imageUrl.startsWith('http://localhost') ||
        imageUrl.match(/^http:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/)
      ) {
        throw new Error('API 返回了无效的图片地址（内网地址）');
      }

      return {
        url: imageUrl,
        revisedPrompt: data.result?.data?.[0]?.revised_prompt,
      };
    }

    if (data.status === 'failed') {
      throw new Error(`任务失败: ${data.error?.message || '未知错误'}`);
    }

    // running / queued / processing → 等 5 秒再查
    await new Promise((r) => setTimeout(r, 5000));
  }

  throw new Error('任务超时（等待超过 5 分钟）');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, prompt, aspectRatio, resolution, size, model, strength, apiUrl } = body;

    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: '未提供 API Key' }, { status: 401 });
    }

    if (!items?.length || !prompt) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    const effectiveApiUrl = apiUrl || DEFAULT_API_URL;
    const effectiveModel = model || DEFAULT_MODEL;

    // 计算尺寸
    const resKey = (resolution || '2k').toLowerCase().replace('k', '') + 'k';
    const { size: pixelSize } = getModelAndSize(
      effectiveModel,
      aspectRatio || size || '1:1',
      resolution || '2k'
    );

    console.log(
      `[manxiaobai] items=${items.length}, model=${effectiveModel}, ` +
      `ratio=${aspectRatio || size}, res=${resolution || '2k'}, pixelSize=${pixelSize}`
    );

    // SSE 流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'start', total: items.length });

        const results: Array<{ index: number; status: string; imageUrl?: string; revisedPrompt?: string }> = [];
        const errors: Array<{ index: number; status: string; error: string }> = [];

        // 分批处理，每批 5 张
        const CONCURRENCY = 5;
        const batches: Array<typeof items> = [];
        for (let i = 0; i < items.length; i += CONCURRENCY) {
          batches.push(items.slice(i, i + CONCURRENCY));
        }

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
          const batch = batches[batchIdx];

          // 第 1 批之后，每批间隔 1 秒
          if (batchIdx > 0) {
            await new Promise((r) => setTimeout(r, 1000));
          }

          const batchResults = await Promise.all(
            batch.map(async (item: { imageUrl: string; index: number }) => {
              const { index } = item;
              let lastError: Error | null = null;

              // 最多重试 2 次（共 3 次尝试）
              for (let attempt = 0; attempt < 3; attempt++) {
                try {
                  if (attempt > 0) {
                    console.log(`[manxiaobai] 重试 ${index} (attempt ${attempt + 1})`);
                    send({ type: 'progress', index, status: 'retrying', attempt: attempt + 1 });
                    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
                  }

                  // 1. 下载原图
                  send({ type: 'progress', index, status: 'uploading' });
                  const { blob, filename } = await downloadImageAsBlob(item.imageUrl);

                  // 2. 提交异步任务
                  send({ type: 'progress', index, status: 'generating' });
                  const taskId = await submitAsyncTask(
                    effectiveApiUrl,
                    apiKey,
                    effectiveModel,
                    prompt,
                    pixelSize,
                    blob,
                    filename
                  );

                  console.log(`[manxiaobai] 任务 ${index}: ${taskId}`);
                  send({ type: 'progress', index, status: 'processing', taskId });

                  // 3. 轮询结果
                  const result = await pollTaskResult(effectiveApiUrl, apiKey, taskId);
                  console.log(`[manxiaobai] 完成 ${index}: ${result.url.slice(0, 80)}...`);

                  return {
                    index,
                    status: 'completed',
                    imageUrl: result.url,
                    revisedPrompt: result.revisedPrompt,
                  };
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  lastError = err instanceof Error ? err : new Error(msg);
                  const errLower = msg.toLowerCase();

                  // 内网地址 → 不重试，直接失败
                  if (msg.includes('内网地址')) {
                    console.error(`[manxiaobai] 内网地址 ${index}, 不重试`);
                    return { index, status: 'failed', error: msg };
                  }

                  // 429/524/网络错误 → 重试
                  if (
                    errLower.includes('429') ||
                    errLower.includes('524') ||
                    errLower.includes('fetch failed') ||
                    errLower.includes('timeout') ||
                    errLower.includes('econnreset')
                  ) {
                    console.warn(`[manxiaobai] 可重试错误 ${index}: ${msg}`);
                    continue;
                  }

                  // 其他错误 → 不重试
                  console.error(`[manxiaobai] 不可重试错误 ${index}: ${msg}`);
                  return { index, status: 'failed', error: msg };
                }
              }

              // 重试耗尽
              return {
                index,
                status: 'failed',
                error: `重试 3 次后仍失败: ${lastError?.message || '未知错误'}`,
              };
            })
          );

          for (const r of batchResults) {
            if (r.status === 'completed') {
              results.push(r as typeof results[number]);
            } else {
              errors.push(r as typeof errors[number]);
            }
            send(r);
          }
        }

        send({ type: 'done', results, errors });
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
