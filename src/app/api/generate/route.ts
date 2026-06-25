import { NextRequest } from 'next/server';

const APIMART_BASE_URL = 'https://api.apimart.ai';

interface TaskResult {
  type: 'progress' | 'result' | 'done' | 'start' | 'error';
  current?: number;
  total?: number;
  index?: number;
  success?: boolean;
  imageUrl?: string;
  error?: string;
}

async function submitTask(
  imageUrl: string,
  prompt: string,
  size: string,
  resolution: string,
  apiKey: string
): Promise<{ task_id: string } | null> {
  const response = await fetch(`${APIMART_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      n: 1,
      size,
      resolution,
      image_urls: [imageUrl],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      errorData?.error?.message || `API request failed with status ${response.status}`
    );
  }

  const data = await response.json();

  if (data.code !== 200 || !data.data?.[0]?.task_id) {
    throw new Error(data?.error?.message || 'Failed to submit task');
  }

  return { task_id: data.data[0].task_id };
}

async function pollTask(
  taskId: string,
  apiKey: string,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const maxAttempts = 120; // Max 2 minutes (120 * 1s)
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;

    const response = await fetch(`${APIMART_BASE_URL}/v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Task query failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 200) {
      throw new Error(data?.error?.message || 'Task query returned error');
    }

    const taskData = data.data;
    const status = taskData?.status;
    const progress = taskData?.progress ?? 0;

    onProgress?.(progress);

    if (status === 'completed') {
      const imageUrl = taskData?.result?.images?.[0]?.url?.[0];
      if (imageUrl) {
        return { success: true, imageUrl };
      }
      return { success: false, error: 'No image URL in result' };
    }

    if (status === 'failed') {
      return {
        success: false,
        error: taskData?.error?.message || 'Task failed',
      };
    }

    // status is 'submitted' or 'processing', continue polling
  }

  return { success: false, error: 'Task timed out after 2 minutes' };
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, prompt, size, resolution } = await request.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No image URLs provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = process.env.APIMART_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const encoder = new TextEncoder();
    const total = imageUrls.length;
    const aspectRatio = size || '1:1';
    const res = resolution || '2k';

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: TaskResult) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        send({ type: 'start', total });

        // Submit all tasks first
        const taskIds: (string | null)[] = [];
        for (let i = 0; i < total; i++) {
          try {
            send({ type: 'progress', current: i, total });
            const result = await submitTask(
              imageUrls[i],
              prompt.trim(),
              aspectRatio,
              res,
              apiKey
            );
            taskIds.push(result?.task_id || null);
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Submit failed';
            send({ type: 'result', index: i, success: false, error: errorMessage });
            taskIds.push(null);
          }
        }

        // Poll all tasks concurrently
        let completed = 0;
        const pollPromises = taskIds.map(async (taskId, index) => {
          if (!taskId) {
            completed++;
            return; // Already sent error result
          }

          try {
            const result = await pollTask(taskId, apiKey, (progress) => {
              // Optional: send per-task progress
              const overallProgress = Math.round(
                ((completed + progress / 100) / total) * 100
              );
              send({
                type: 'progress',
                current: Math.min(completed + 1, total),
                total,
              });
            });

            completed++;
            send({ type: 'progress', current: completed, total });
            send({ type: 'result', index, ...result });
          } catch (err) {
            completed++;
            const errorMessage = err instanceof Error ? err.message : 'Poll failed';
            send({ type: 'progress', current: completed, total });
            send({ type: 'result', index, success: false, error: errorMessage });
          }
        });

        await Promise.all(pollPromises);

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
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
