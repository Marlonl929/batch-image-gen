import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_API_URL = 'https://ncp.hayoz.top/v1';

// 同步图生图 - 直接返回结果，无需轮询
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, prompt, aspectRatio, resolution, size: sizeParam, model, strength, apiUrl: clientApiUrl } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '请提供至少一张图片' }, { status: 400 });
    }

    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ error: '缺少 API Key' }, { status: 401 });
    }

    const apiUrl = (clientApiUrl || DEFAULT_API_URL).replace(/\/+$/, '');

    // 并行处理所有图片（同步模式，直接返回结果）
    const results = await Promise.all(
      items.map(async (item: { imageUrl: string; index: number }, idx: number) => {
        try {
          // 计算图片尺寸
          let size = '1024x1024';
          if (sizeParam && typeof sizeParam === 'string') {
            if (sizeParam.includes('x')) {
              size = sizeParam;
            } else {
              // 旧格式 aspect ratio，转换为实际尺寸
              const sizeMap: Record<string, string> = {
                '1:1': '1024x1024',
                '16:9': '1344x768',
                '9:16': '768x1344',
                '4:3': '1152x896',
                '3:4': '896x1152',
                '3:2': '1216x832',
                '2:3': '832x1216',
                '21:9': '1536x640',
              };
              size = sizeMap[sizeParam] || '1024x1024';
            }
          }

          // 调用同步生图接口
          const response = await fetch(`${apiUrl}/images/generations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: model || 'gpt-image-2',
              prompt: prompt || '',
              size,
              n: 1,
              response_format: 'url',
              image_urls: [item.imageUrl],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[generate] 图片 ${idx} API 错误:`, response.status, errorText);
            return {
              index: item.index,
              status: 'failed' as const,
              error: `API 返回 ${response.status}: ${errorText.slice(0, 200)}`,
            };
          }

          const data = await response.json();

          // 同步接口直接返回结果
          if (data.data && data.data.length > 0 && data.data[0].url) {
            return {
              index: item.index,
              status: 'completed' as const,
              imageUrl: data.data[0].url,
              revisedPrompt: data.data[0].revised_prompt,
            };
          } else {
            console.error(`[generate] 图片 ${idx} 返回数据异常:`, JSON.stringify(data).slice(0, 300));
            return {
              index: item.index,
              status: 'failed' as const,
              error: 'API 返回数据格式异常',
            };
          }
        } catch (error) {
          console.error(`[generate] 图片 ${idx} 处理失败:`, error);
          return {
            index: item.index,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : '处理失败',
          };
        }
      })
    );

    // 分类成功和失败的结果
    const completedResults = results.filter(
      (r: { status: string }) => r.status === 'completed'
    );
    const failedResults = results.filter(
      (r: { status: string }) => r.status === 'failed'
    );

    return NextResponse.json({
      results: completedResults,
      errors: failedResults,
    });
  } catch (error) {
    console.error('[generate] 处理失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '处理失败' },
      { status: 500 }
    );
  }
}
