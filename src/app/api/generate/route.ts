import { NextRequest } from 'next/server';

interface GenerateResult {
  type: 'progress' | 'result' | 'done' | 'start' | 'error';
  current?: number;
  total?: number;
  index?: number;
  success?: boolean;
  imageUrl?: string;
  error?: string;
}

const APIMART_API_URL = 'https://api.apimart.ai';

// Submit image generation task
async function submitTask(params: {
  prompt: string;
  imageUrls: string[];
  size: string;
  resolution: string;
  apiKey: string;
}): Promise<{ task_id: string; status: string }> {
  console.log('[SubmitTask] Calling APIMart API...');
  console.log('[SubmitTask] URL:', `${APIMART_API_URL}/v1/images/generations`);
  console.log('[SubmitTask] Params:', { prompt: params.prompt.slice(0, 50), imageCount: params.imageUrls.length, size: params.size, resolution: params.resolution });

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
  console.log('[SubmitTask] Response status:', response.status);
  console.log('[SubmitTask] Response data:', JSON.stringify(data).slice(0, 500));

  if (data.error) {
    throw new Error(data.error.message || '提交任务失败');
  }

  if (!data.data?.[0]?.task_id) {
    throw new Error('未获取到任务ID');
  }

  console.log('[SubmitTask] Task created:', data.data[0].task_id);
  return {
    task_id: data.data[0].task_id,
    status: data.data[0].status,
  };
}

// Poll task status until completion
async function pollTaskResult(
  taskId: string,
  apiKey: string,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const maxAttempts = 60; // Max 5 minutes (60 * 5s)
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(`${APIMART_API_URL}/v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || '查询任务失败');
    }

    const taskData = data.data;
    const status = taskData?.status;
    const progress = taskData?.progress || 0;

    onProgress?.(progress);

    if (status === 'completed') {
      const imageUrl = taskData?.result?.images?.[0]?.url?.[0];
      if (imageUrl) {
        return { success: true, imageUrl };
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

  return { success: false, error: '任务超时' };
}

export async function POST(request: NextRequest) {
  console.log('[Generate API] Request received');

  try {
    const body = await request.json();
    const { imageUrls, prompt, size, resolution, apiKey } = body;
    console.log('[Generate API] Params:', { imageCount: imageUrls?.length, prompt: prompt?.slice(0, 50), size, resolution, hasApiKey: !!apiKey });

    if (!apiKey || typeof apiKey !== 'string') {
      console.error('[Generate API] API Key is missing');
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

    const encoder = new TextEncoder();
    const total = imageUrls.length;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: GenerateResult) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        send({ type: 'start', total });

        let completed = 0;

        // Step 1: Submit all tasks in parallel
        send({ type: 'progress', current: 0, total });
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

        // Collect successfully submitted tasks
        const pendingTasks: { index: number; task_id: string }[] = [];
        for (const submission of taskSubmissions) {
          if (submission.status === 'fulfilled') {
            pendingTasks.push({ index: submission.value.index, task_id: submission.value.task_id });
          } else {
            completed++;
            const idx = taskSubmissions.indexOf(submission);
            const errorMessage = submission.reason instanceof Error ? submission.reason.message : '提交任务失败';
            send({ type: 'progress', current: completed, total });
            send({ type: 'result', index: idx, success: false, error: errorMessage });
          }
        }

        console.log(`[Generate] Submitted ${pendingTasks.length}/${total} tasks, failed: ${total - pendingTasks.length}`);

        // Step 2: Poll all tasks in parallel
        if (pendingTasks.length > 0) {
          const pollResults = await Promise.allSettled(
            pendingTasks.map(task =>
              pollTaskResult(task.task_id, apiKey, (progress) => {
                // Optional per-task progress
              }).then(result => ({ index: task.index, ...result }))
            )
          );

          for (const pollResult of pollResults) {
            completed++;
            if (pollResult.status === 'fulfilled') {
              const { index, success, imageUrl, error } = pollResult.value;
              send({ type: 'progress', current: completed, total });
              if (success && imageUrl) {
                send({ type: 'result', index, success: true, imageUrl });
              } else {
                send({ type: 'result', index, success: false, error: error || '生成失败' });
              }
            } else {
              const idx = pendingTasks[pollResults.indexOf(pollResult)]?.index ?? 0;
              const errorMessage = pollResult.reason instanceof Error ? pollResult.reason.message : '生成失败';
              send({ type: 'progress', current: completed, total });
              send({ type: 'result', index: idx, success: false, error: errorMessage });
            }
          }
        }

        send({ type: 'done', total });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
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
