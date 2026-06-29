import { NextRequest } from 'next/server';

const DEFAULT_API_URL = 'https://new.hayoz.top';

/**
 * GET /api/task-status/[taskId]?apiKey=xxx&apiUrl=xxx
 * Returns the current status of a single async image job.
 * Client polls this endpoint until status is 'completed' or 'failed'.
 * 
 * New API response format:
 * - queued / running → still processing
 * - succeeded → done, result in data[0].url or result.data[0].url
 * - failed → error in error field
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

    const response = await fetch(`${baseUrl}/v1/async/images/generations/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (data.error && !data.status) {
      return new Response(
        JSON.stringify({ error: data.error.message || data.error || '查询任务失败' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const status = data.status; // 'queued' | 'running' | 'succeeded' | 'failed'

    if (status === 'succeeded') {
      // Extract image URL from data or result
      const imageUrl = data.data?.[0]?.url || data.result?.data?.[0]?.url || null;
      return new Response(
        JSON.stringify({
          status: 'completed',
          progress: 100,
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
          progress: 0,
          error: data.error || '生成失败',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Still processing (queued or running)
    const progress = status === 'running' ? 50 : 10;
    return new Response(
      JSON.stringify({
        status: status || 'queued',
        progress,
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
