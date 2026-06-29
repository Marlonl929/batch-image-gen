import { NextRequest } from 'next/server';

const DEFAULT_API_URL = 'https://new.hayoz.top';

// Submit a single async image generation task
async function submitTask(params: {
  prompt: string;
  imageUrls: string[];
  size: string;
  apiKey: string;
  apiUrl: string;
}): Promise<{ job_id: string; status: string }> {
  const response = await fetch(`${params.apiUrl}/v1/async/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: params.prompt,
      n: 1,
      size: params.size,
      response_format: 'url',
      image_urls: params.imageUrls,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || data.error || '提交任务失败');
  }

  // New API returns job_id directly
  const jobId = data.job_id || data.id;
  if (!jobId) {
    throw new Error('未获取到任务ID');
  }

  return {
    job_id: jobId,
    status: data.status || 'queued',
  };
}

/**
 * POST /api/generate
 * Only submits all tasks and returns their job_ids immediately.
 * No polling on server side — client will poll /api/task-status/[taskId] instead.
 * This avoids Vercel/Render serverless function timeout.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrls, prompt, size, apiKey, apiUrl } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return new Response(
        JSON.stringify({ error: '请先在设置中配置 API Key' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = (apiUrl && typeof apiUrl === 'string') ? apiUrl.replace(/\/+$/, '') : DEFAULT_API_URL;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
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

    // Calculate actual pixel size from aspect ratio
    // The new API expects size like "1024x1024"
    let pixelSize = '1024x1024';
    if (size && size !== 'auto') {
      // size is already in "WxH" format from frontend calculateSize, or it's an aspect ratio
      if (size.includes('x')) {
        pixelSize = size;
      } else {
        // Map common aspect ratios to pixel sizes
        const ratioMap: Record<string, string> = {
          '1:1': '1024x1024',
          '16:9': '1536x864',
          '9:16': '864x1536',
          '4:3': '1364x1024',
          '3:4': '1024x1364',
          '3:2': '1536x1024',
          '2:3': '1024x1536',
          '5:4': '1280x1024',
          '4:5': '1024x1280',
          '21:9': '1536x658',
          '9:21': '658x1536',
          '1:3': '512x1536',
          '3:1': '1536x512',
          '2:1': '1536x768',
          '1:2': '768x1536',
        };
        pixelSize = ratioMap[size] || '1024x1024';
      }
    }

    // Submit all tasks in parallel
    const taskSubmissions = await Promise.allSettled(
      imageUrls.map((imageUrl: string, i: number) =>
        submitTask({
          prompt: prompt.trim(),
          imageUrls: [imageUrl],
          size: pixelSize,
          apiKey,
          apiUrl: baseUrl,
        }).then(result => ({ index: i, ...result }))
      )
    );

    // Build response with job_ids and any immediate failures
    const tasks: { index: number; task_id: string }[] = [];
    const immediateErrors: { index: number; error: string }[] = [];

    for (let i = 0; i < taskSubmissions.length; i++) {
      const submission = taskSubmissions[i];
      if (submission.status === 'fulfilled') {
        tasks.push({ index: submission.value.index, task_id: submission.value.job_id });
      } else {
        const errorMessage = submission.reason instanceof Error
          ? submission.reason.message
          : '提交任务失败';
        immediateErrors.push({ index: i, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({ tasks, immediateErrors }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
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
