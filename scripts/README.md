# 批量图生图处理脚本

一个用于批量处理图片的 Python 脚本，自动从输入文件夹读取图片，调用 API 生成新图片，并将结果保存到输出文件夹。

## 功能特点

- **三个文件夹管理**：
  - `input/` - 放入待处理的原始图片
  - `output/` - 生成的结果图片保存在这里
  - `completed/` - 处理完成的原图自动移到这里

- **批量处理**：支持并行处理多张图片
- **自动重试**：上传失败自动重试
- **进度显示**：实时显示处理进度

## 安装

1. 确保已安装 Python 3.7+

2. 安装依赖：
```bash
pip install -r requirements.txt
```

## 使用方法

### 1. 修改配置

打开 `batch_processor.py`，修改以下配置：

```python
# API 配置
API_BASE_URL = "https://api.apimart.ai"  # API 地址
API_KEY = "your-api-key-here"  # 替换为你的 API Key

# 生成参数
PROMPT = "将图片转换为吉卜力动画风格"  # 提示词
ASPECT_RATIO = "1:1"  # 宽高比
RESOLUTION = "2k"  # 分辨率
```

### 2. 准备图片

将待处理的图片放入 `input/` 文件夹：
```
input/
├── image1.jpg
├── image2.png
└── image3.webp
```

### 3. 运行脚本

```bash
python batch_processor.py
```

### 4. 查看结果

处理完成后：
- 生成的图片在 `output/` 文件夹
- 原图已移动到 `completed/` 文件夹

## 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `API_BASE_URL` | API 服务地址 | `https://api.apimart.ai` |
| `API_KEY` | API 密钥 | - |
| `PROMPT` | 生成提示词 | `将图片转换为吉卜力动画风格` |
| `ASPECT_RATIO` | 宽高比 | `1:1` |
| `RESOLUTION` | 分辨率 | `2k` |
| `BATCH_SIZE` | 每批处理数量 | `5` |
| `POLL_INTERVAL` | 轮询间隔（秒） | `5` |
| `MAX_POLL_TIME` | 最大等待时间（秒） | `300` |

### 宽高比选项

- `1:1` - 正方形
- `16:9` - 横屏
- `9:16` - 竖屏
- `4:3` - 标准横屏
- `3:4` - 标准竖屏
- `3:2` - 照片横屏
- `2:3` - 照片竖屏

### 分辨率选项

- `1k` - 1024px
- `2k` - 2048px
- `4k` - 4096px

## 支持的图片格式

- JPG / JPEG
- PNG
- WebP
- BMP

## 工作流程

```
1. 扫描 input/ 文件夹
2. 逐张上传图片
3. 提交生成任务
4. 轮询等待结果
5. 下载生成图片到 output/
6. 移动原图到 completed/
7. 显示统计结果
```

## 注意事项

1. 确保 API Key 有足够的额度
2. 大文件可能需要更长的上传时间
3. 网络不稳定时可能需要增加重试次数
4. 处理大量图片时注意 API 调用限制

## 故障排除

### 上传失败
- 检查网络连接
- 检查 API Key 是否正确
- 检查图片文件大小

### 生成失败
- 检查 API 额度
- 检查提示词是否合规
- 查看控制台错误信息

### 轮询超时
- 增加 `MAX_POLL_TIME` 值
- 检查 API 服务状态
