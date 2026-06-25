import { NextRequest } from 'next/server';
import { ImageGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface GenerateResult {
  type: 'progress' | 'result' | 'done' | 'start' | 'error';
  current?: number;
  total?: number;
  index?: number;
  success?: boolean;
  imageUrl?: string;
  error?: string;
}

// Map aspect ratio + resolution to SDK size format
function getSDKSize(aspectRatio: string, resolution: string): string {
  // SDK supports "2K", "4K", or "WIDTHxHEIGHT"
  // For simplicity, use resolution as the base size
  const resMap: Record<string, string> = {
    '1k': '2K', // SDK minimum is 2K
    '2k': '2K',
    '4k': '4K',
  };
  return resMap[resolution] || '2K';
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, prompt, size, resolution } = await request.json();

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

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new ImageGenerationClient(config, customHeaders);

    const encoder = new TextEncoder();
    const total = imageUrls.length;
    const sdkSize = getSDKSize(size || '1:1', resolution || '2k');

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: GenerateResult) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        send({ type: 'start', total });

        // Process images with concurrency limit
        const concurrency = 2;
        let completed = 0;

        const processImage = async (imageUrl: string, index: number) => {
          try {
            send({ type: 'progress', current: completed + 1, total });

            const response = await client.generate({
              prompt: prompt.trim(),
              image: imageUrl,
              size: sdkSize,
            });

            const helper = client.getResponseHelper(response);

            completed++;
            send({ type: 'progress', current: completed, total });

            if (helper.success && helper.imageUrls.length > 0) {
              send({
                type: 'result',
                index,
                success: true,
                imageUrl: helper.imageUrls[0],
              });
            } else {
              send({
                type: 'result',
                index,
                success: false,
                error: helper.errorMessages[0] || '生成失败',
              });
            }
          } catch (err) {
            completed++;
            const errorMessage = err instanceof Error ? err.message : '生成失败';
            send({ type: 'progress', current: completed, total });
            send({ type: 'result', index, success: false, error: errorMessage });
          }
        };

        // Process in batches
        for (let i = 0; i < total; i += concurrency) {
          const batch = imageUrls.slice(i, i + concurrency);
          const promises = batch.map((url: string, batchIndex: number) =>
            processImage(url, i + batchIndex)
          );
          await Promise.all(promises);
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
