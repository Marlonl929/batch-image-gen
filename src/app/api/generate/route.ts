import { NextRequest } from 'next/server';

const APIMART_API_URL = 'https://api.apimart.ai';

// Submit a single image generation task
async function submitTask(params: {
  prompt: string;
  imageUrls: string[];
  size: string;
  resolution: string;
  apiKey: string;
}): Promise<{ task_id: string; status: string }> {
  const response = await fetch(`${APIMART_API_URL}/v1/images/generations`, {
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
      resolution: params.resolution,
      image_urls: params.imageUrls,
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || '提交任务失败');
  }

  if (!data.data?.[0]?.task_id) {
    throw new Error('未获取到任务ID');
  }

  return {
    task_id: data.data[0].task_id,
    status: data.data[0].status,
  };
}

/**
 * POST /api/generate
 * Only submits all tasks and returns their task_ids immediately.
 * No polling on server side — client will poll /api/task-status/[taskId] instead.
 * This avoids Vercel serverless function timeout.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrls, prompt, size, resolution, apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return new Response(
        JSON.stringify({ error: '请先在设置中配置 APIMart API Key' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

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

    // Submit all tasks in parallel
    const taskSubmissions = await Promise.allSettled(
      imageUrls.map((imageUrl: string, i: number) =>
        submitTask({
          prompt: prompt.trim(),
          imageUrls: [imageUrl],
          size: size || '1:1',
          resolution: resolution || '2k',
          apiKey,
        }).then(result => ({ index: i, ...result }))
      )
    );

    // Build response with task_ids and any immediate failures
    const tasks: { index: number; task_id: string }[] = [];
    const immediateErrors: { index: number; error: string }[] = [];

    for (let i = 0; i < taskSubmissions.length; i++) {
      const submission = taskSubmissions[i];
      if (submission.status === 'fulfilled') {
        tasks.push({ index: submission.value.index, task_id: submission.value.task_id });
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
