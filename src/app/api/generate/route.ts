import { NextRequest } from 'next/server';

interface GenerationResult {
  index: number;
  status: 'completed' | 'failed';
  imageUrl?: string;
  revisedPrompt?: string;
  error?: string;
}

// Submit image generation task to APIMart
async function submitTask(params: {
  apiUrl: string;
  apiKey: string;
  prompt: string;
  imageUrls: string[];
  size: string;
  resolution: string;
  model: string;
}): Promise<{ task_id: string }> {
  const response = await fetch(`${params.apiUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model || 'gpt-image-2',
      prompt: params.prompt,
      n: 1,
      size: params.size,
      resolution: params.resolution,
      image_urls: params.imageUrls,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API 返回 ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || '提交任务失败');
  }

  if (!data.data?.[0]?.task_id) {
    throw new Error('未获取到任务ID');
  }

  return { task_id: data.data[0].task_id };
}

// Poll task status until completion
async function pollTaskResult(params: {
  apiUrl: string;
  apiKey: string;
  taskId: string;
  maxAttempts?: number;
}): Promise<{ success: boolean; imageUrl?: string; revisedPrompt?: string; error?: string }> {
  const { apiUrl, apiKey, taskId } = params;
  const maxAttempts = params.maxAttempts || 60;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(`${apiUrl}/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`查询任务失败 (${response.status}): ${text.slice(0, 200)}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || '查询任务失败');
    }

    const taskData = data.data;
    const status = taskData?.status;

    if (status === 'completed') {
      const imageUrl = taskData?.result?.images?.[0]?.url?.[0];
      const revisedPrompt = taskData?.result?.images?.[0]?.revised_prompt;
      if (imageUrl) {
        return { success: true, imageUrl, revisedPrompt };
      }
      return { success: false, error: '未获取到生成结果' };
    }

    if (status === 'failed') {
      return { success: false, error: taskData?.error?.message || '生成失败' };
    }

    // Wait 5 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }

  return { success: false, error: '任务超时（5分钟）' };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiKey = request.headers.get('x-api-key') || '';
    const { items, prompt, aspectRatio, resolution, size, model } = body;

    // Resolve API URL: frontend-provided or default
    const apiUrl = (body.apiUrl || 'https://api.apimart.ai/v1').replace(/\/+$/, '');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: '未设置 API Key，请点击右上角设置按钮输入' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: '没有提供图片' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: '请输入提示词' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Map aspect ratio to size if not provided
    const sizeMap: Record<string, string> = {
      '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536',
      '4:3': '1365x1024', '3:4': '1024x1365', '16:9': '1792x1024',
      '9:16': '1024x1792', '21:9': '1920x832', '5:4': '1280x1024',
      '4:5': '1024x1280', '3:1': '2688x896', '1:3': '896x2688',
    };
    const pixelSize = sizeMap[aspectRatio] || sizeMap[size] || '1024x1024';

    console.log(`[generate] Processing ${items.length} images, size=${pixelSize}, resolution=${resolution}`);

    // Process images in batches of 5
    const BATCH_SIZE = 5;
    const results: GenerationResult[] = [];

    for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, items.length);
      const batch = items.slice(batchStart, batchEnd);

      const batchPromises = batch.map(async (item: { imageUrl: string; index: number }) => {
        try {
          // Step 1: Submit task
          const { task_id } = await submitTask({
            apiUrl,
            apiKey,
            prompt: prompt.trim(),
            imageUrls: [item.imageUrl],
            size: pixelSize,
            resolution: resolution || '2k',
            model: model || 'gpt-image-2',
          });

          console.log(`[generate] Image ${item.index}: task submitted, id=${task_id}`);

          // Step 2: Poll for result
          const result = await pollTaskResult({ apiUrl, apiKey, taskId: task_id });

          if (result.success && result.imageUrl) {
            console.log(`[generate] Image ${item.index}: completed`);
            return {
              index: item.index,
              status: 'completed' as const,
              imageUrl: result.imageUrl,
              revisedPrompt: result.revisedPrompt,
            };
          } else {
            console.log(`[generate] Image ${item.index}: failed - ${result.error}`);
            return {
              index: item.index,
              status: 'failed' as const,
              error: result.error || '生成失败',
            };
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : '生成失败';
          console.error(`[generate] Image ${item.index}: error -`, errorMessage);
          return {
            index: item.index,
            status: 'failed' as const,
            error: errorMessage,
          } as GenerationResult;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Delay between batches (1 second)
      if (batchEnd < items.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Sort by index
    results.sort((a, b) => a.index - b.index);

    const completed = results.filter(r => r.status === 'completed');
    const failed = results.filter(r => r.status === 'failed');

    console.log(`[generate] Done: ${completed.length} success, ${failed.length} failed`);

    return new Response(
      JSON.stringify({ results: completed, errors: failed }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Generate error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '服务器内部错误',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
