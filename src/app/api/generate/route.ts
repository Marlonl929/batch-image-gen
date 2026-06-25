import { NextRequest } from 'next/server';
import { ImageGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, prompt, size } = await request.json();

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

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new ImageGenerationClient(config, customHeaders);

    const encoder = new TextEncoder();
    const total = imageUrls.length;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        // Send start event
        send({ type: 'start', total });

        // Process images with concurrency limit of 2
        const concurrencyLimit = 2;
        let completed = 0;

        for (let i = 0; i < total; i += concurrencyLimit) {
          const batch = imageUrls.slice(i, i + concurrencyLimit);
          const batchPromises = batch.map(async (imageUrl: string, batchIndex: number) => {
            const index = i + batchIndex;
            try {
              const response = await client.generate({
                prompt: prompt.trim(),
                image: imageUrl,
                size: size || '2K',
              });

              const helper = client.getResponseHelper(response);

              if (helper.success && helper.imageUrls.length > 0) {
                return {
                  type: 'result' as const,
                  index,
                  success: true,
                  imageUrl: helper.imageUrls[0],
                };
              } else {
                return {
                  type: 'result' as const,
                  index,
                  success: false,
                  error: helper.errorMessages[0] || 'Generation failed',
                };
              }
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Unknown error';
              return {
                type: 'result' as const,
                index,
                success: false,
                error: errorMessage,
              };
            }
          });

          const batchResults = await Promise.all(batchPromises);

          for (const result of batchResults) {
            completed++;
            send({ type: 'progress', current: completed, total });
            send(result);
          }
        }

        // Send done event
        send({ type: 'done', total });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Generate error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start generation' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
