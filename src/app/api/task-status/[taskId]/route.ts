import { NextRequest } from 'next/server';

const DEFAULT_API_URL = 'https://api.apimart.ai';

/**
 * GET /api/task-status/[taskId]?apiKey=xxx&apiUrl=xxx
 * Returns the current status of a single task.
 * Client polls this endpoint until status is 'completed' or 'failed'.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const apiKey = request.nextUrl.searchParams.get('apiKey');
    const apiUrlParam = request.nextUrl.searchParams.get('apiUrl');
    const baseUrl = (apiUrlParam && typeof apiUrlParam === 'string')
      ? apiUrlParam.replace(/\/+$/, '')
      : DEFAULT_API_URL;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API Key is missing' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch(`${baseUrl}/v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (data.error) {
      return new Response(
        JSON.stringify({ error: data.error.message || '查询任务失败' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const taskData = data.data;
    const status = taskData?.status; // 'pending' | 'running' | 'completed' | 'failed'

    if (status === 'completed') {
      const imageUrl = taskData?.result?.images?.[0]?.url?.[0];
      return new Response(
        JSON.stringify({
          status: 'completed',
          progress: taskData?.progress || 100,
          imageUrl: imageUrl || null,
          error: imageUrl ? null : '未获取到生成结果',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (status === 'failed') {
      return new Response(
        JSON.stringify({
          status: 'failed',
          progress: taskData?.progress || 0,
          error: taskData?.error?.message || '生成失败',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Still processing
    return new Response(
      JSON.stringify({
        status: status || 'pending',
        progress: taskData?.progress || 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Task status error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '查询失败',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
