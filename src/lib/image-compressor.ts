/**
 * 图片压缩工具
 * 用于在前端压缩图片，减小文件大小以满足 Render 免费版的 1.5MB 限制
 */

const MAX_FILE_SIZE = 1.4 * 1024 * 1024; // 1.4MB (留一些余量)
const MAX_DIMENSION = 2048; // 最大边长
const JPEG_QUALITY = 0.85; // JPEG 质量

/**
 * 压缩图片
 * @param file 原始图片文件
 * @returns 压缩后的 Blob 对象
 */
export async function compressImage(file: File): Promise<Blob> {
  // 如果文件已经小于限制，直接返回
  if (file.size <= MAX_FILE_SIZE) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('无法创建 Canvas 上下文'));
      return;
    }

    img.onload = () => {
      // 计算缩放后的尺寸
      let { width, height } = img;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = (height / width) * MAX_DIMENSION;
          width = MAX_DIMENSION;
        } else {
          width = (width / height) * MAX_DIMENSION;
          height = MAX_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // 绘制缩放后的图片
      ctx.drawImage(img, 0, 0, width, height);

      // 转换为 JPEG Blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('图片压缩失败'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      reject(new Error('图片加载失败'));
    };

    // 创建 Object URL 加载图片
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    // 清理 Object URL
    img.onload = (() => {
      const originalOnload = img.onload;
      return () => {
        URL.revokeObjectURL(objectUrl);
        if (originalOnload) {
          (originalOnload as () => void).call(img);
        }
      };
    })();
  });
}

/**
 * 压缩图片并返回 File 对象
 * @param file 原始图片文件
 * @returns 压缩后的 File 对象
 */
export async function compressImageFile(file: File): Promise<File> {
  // 如果文件已经小于限制，直接返回
  if (file.size <= MAX_FILE_SIZE) {
    return file;
  }

  const blob = await compressImage(file);
  const compressedName = file.name.replace(/\.[^.]+$/, '.jpg');
  
  return new File([blob], compressedName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
