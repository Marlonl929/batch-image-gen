import { NextRequest } from 'next/server';

interface GenerationResult {
  index: number;
  status: 'completed' | 'failed';
  imageUrl?: string;
  revisedPrompt?: string;
  error?: string;
}

// Detect real image format from buffer magic bytes
function detectImageFormat(buffer: Uint8Array): { mime: string; ext: string } {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return { mime: 'image/png', ext: 'png' };
}

async function generateSingleImage(params: {
  apiUrl: string;
  apiKey: string;
  sourceImageUrl: string;
  prompt: string;
  size: string;
  index: number;
}): Promise<GenerationResult> {
  const { apiUrl, apiKey, sourceImageUrl, prompt, size, index } = params;

  try {
    // Download original image
    const imgResp = await fetch(sourceImageUrl);
    if (!imgResp.ok) {
      return { index, status: 'failed', error: `下载原图失败: ${imgResp.status}` };
    }
    const imgBuffer = await imgResp.arrayBuffer();
    const imgBytes = new Uint8Array(imgBuffer);

    // Detect real format from magic bytes
    const fmt = detectImageFormat(imgBytes);

    // Build FormData for edits endpoint
    const formData = new FormData();
    formData.append('model', 'gpt-image-2');
    formData.append('prompt', prompt);
    formData.append('size', size);
    formData.append('response_format', 'url');
    formData.append(
      'image',
      new Blob([imgBuffer], { type: fmt.mime }),
      `image.${fmt.ext}`
    );

    const endpoint = `${apiUrl.replace(/\/$/, '')}/images/edits`;

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { index, status: 'failed', error: `API 返回 ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = await resp.json();
    const item = data.data?.[0];

    if (!item) {
      return { index, status: 'failed', error: 'API 返回数据为空' };
    }

    const imageUrl = item.url || '';
    const revisedPrompt = item.revised_prompt;

    // Check if URL is a localhost/internal address
    if (imageUrl && (
      imageUrl.startsWith('http://127.0.0.1') ||
      imageUrl.startsWith('http://localhost') ||
      imageUrl.startsWith('http://192.168.') ||
      imageUrl.startsWith('http://10.') ||
      imageUrl.startsWith('http://172.16.')
    )) {
      return { index, status: 'failed', error: 'API 返回了无效的图片地址（内网地址），请联系 API 提供方' };
    }

    return {
      index,
      status: 'completed',
      imageUrl,
      revisedPrompt,
    };
  } catch (err) {
    return { index, status: 'failed', error: err instanceof Error ? err.message : '生成失败' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, prompt, aspectRatio, size, model, strength, apiUrl } = body;

    const apiKey = request.headers.get('x-api-key');
    if (!apiKey) {
      return Response.json({ error: '请先设置 API Key' }, { status: 401 });
    }

    if (!items?.length) {
      return Response.json({ error: '请先上传图片' }, { status: 400 });
    }

    // Map aspect ratio to pixel size
    const sizeMap: Record<string, string> = {
      '1:1': '1024x1024',
      '16:9': '1536x1024',
      '9:16': '1024x1536',
      '3:2': '1536x1024',
      '2:3': '1024x1536',
      '4:3': '1024x1024',
      '3:4': '1024x1024',
    };
    const pixelSize = sizeMap[aspectRatio] || size || '1024x1024';

    const effectiveApiUrl = apiUrl || 'https://openqi.sbs/v1';

    // Process all images concurrently
    const allResults = await Promise.all(
      items.map((item: { imageUrl: string; index: number }) =>
        generateSingleImage({
          apiUrl: effectiveApiUrl,
          apiKey,
          sourceImageUrl: item.imageUrl,
          prompt,
          size: pixelSize,
          index: item.index,
        })
      )
    );

    // Split into results (success) and errors (failed) to match frontend expectations
    const results = allResults
      .filter((r) => r.status === 'completed')
      .map((r) => ({ index: r.index, imageUrl: r.imageUrl, revisedPrompt: r.revisedPrompt }));
    const errors = allResults
      .filter((r) => r.status === 'failed')
      .map((r) => ({ index: r.index, error: r.error }));

    return Response.json({ results, errors });
  } catch (err) {
    console.error('Generate error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : '服务器内部错误' },
      { status: 500 }
    );
  }
}
