# AGENTS.md

## 项目概览
批量图生图网页应用 - 支持批量上传图片、输入提示词、调用AI图生图API、实时展示生成进度与结果。

## 技术栈
- Next.js 16 (App Router) + React 19 + TypeScript 5
- Tailwind CSS 4 + shadcn/ui
- coze-coding-dev-sdk (S3Storage 对象存储)
- ncp.hayoz.top GPT-Image-2 API (图生图，异步任务模式)

## 环境变量
- 无外部 API 密钥环境变量，用户在前端设置页面输入 API Key，保存在浏览器 localStorage 中

## 目录结构
```
src/
├── app/
│   ├── page.tsx                    # 主页面（客户端组件）
│   ├── layout.tsx                  # 根布局（dark theme）
│   ├── globals.css                 # 全局样式
│   └── api/
│       ├── upload/route.ts         # 图片上传 → 对象存储
│       └── generate/route.ts       # 批量图生图 (SSE 流式)
├── components/
│   ├── ui/                         # shadcn/ui 组件
│   ├── api-key-settings.tsx        # API Key 设置弹窗（localStorage 存储）
│   ├── image-uploader.tsx          # 图片上传/预览/删除
│   ├── prompt-input.tsx            # 提示词输入 + 参数设置
│   └── result-gallery.tsx          # 生成结果展示 + 下载
└── hooks/
    └── use-image-generation.ts     # 核心业务 Hook（上传+生成+SSE）
```

## 核心流程
1. 前端批量选择图片 → 本地预览
2. 点击生成 → 先批量上传到对象存储获取 URL
3. 调用 /api/generate → SSE 流式返回进度和结果
4. 前端实时渲染进度条 + 结果卡片
5. 支持单张/批量下载（fetch + blob 模式）

## 开发命令
- `pnpm dev` - 启动开发服务器
- `pnpm build` - 构建生产版本
- `pnpm start` - 启动生产服务器
- `pnpm ts-check` - TypeScript 类型检查
- `pnpm lint` - ESLint 检查

## 注意事项
- SDK 仅在后端使用（API Routes），不暴露在前端代码中
- 图片上传使用 S3Storage，必须用 generatePresignedUrl 获取访问 URL
- API Key 由用户在前端设置页面输入，保存在浏览器 localStorage，请求时传给后端
- 图生图使用 ncp.hayoz.top GPT-Image-2 API（异步模式）：
  - 提交任务：POST /v1/async/images/generations → 返回 job_id
  - 轮询结果：GET /v1/async/images/generations/{job_id} → 返回图片 URL
  - 参数：model（gpt-image-2）、prompt、size（如1024x1024）、image_urls（参考图 URL 数组）
  - 默认 API 地址：https://ncp.hayoz.top
- 下载跨域图片必须用 fetch + blob，不能用 <a download>
- API Key 通过前端 localStorage 管理，不依赖服务端环境变量
