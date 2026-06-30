#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量图生图处理脚本 (manxiaobai API 异步版)

功能：
- 从输入文件夹读取图片
- 调用 manxiaobai API 异步图生图接口
- 保存结果到输出文件夹（文件名与源图片一致）
- 将处理完成的原图移动到已完成文件夹

使用方法：
1. 安装依赖：pip install requests
2. 修改下方配置项（API_KEY、PROMPT 等）
3. 运行：python batch_processor.py
"""

import os
import sys
import time
import json
import shutil
import mimetypes
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

# ==================== 配置项 ====================

# API 配置
API_BASE_URL = "https://api.manxiaobai.online/v1"  # API 地址
API_KEY = "your-api-key-here"  # 替换为你的 API Key

# 生成参数
PROMPT = "将图片转换为吉卜力动画风格"  # 提示词
ASPECT_RATIO = "1:1"  # 宽高比：1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9, 5:4, 4:5, 2:1, 1:2
RESOLUTION = "2k"  # 分辨率：1k, 2k, 4k
MODEL = "gpt-image-2"  # 模型名称

# 文件夹配置（相对于脚本运行目录）
INPUT_FOLDER = "./input"  # 输入文件夹
OUTPUT_FOLDER = "./output"  # 输出文件夹
COMPLETED_FOLDER = "./completed"  # 已完成原图文件夹
FAILED_FOLDER = "./failed"  # 生成失败的原图文件夹

# 处理配置
BATCH_SIZE = 5  # 每批处理图片数量
MAX_RETRIES = 3  # 最大重试次数
POLL_INTERVAL = 5  # 轮询间隔（秒）
MAX_POLL_TIME = 300  # 最大轮询时间（秒）

# 支持的图片格式
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# 分辨率 + 比例 → 尺寸映射表
SIZE_MAP = {
    "1k": {
        "1:1": "1024x1024",
        "3:2": "1536x1024",
        "2:3": "1024x1536",
        "16:9": "1824x1024",
        "9:16": "1024x1824",
        "4:3": "1360x1024",
        "3:4": "1024x1360",
        "21:9": "2384x1024",
        "5:4": "1280x1024",
        "4:5": "1024x1280",
        "2:1": "2048x1024",
        "1:2": "1024x2048",
    },
    "2k": {
        "1:1": "2048x2048",
        "3:2": "2048x1360",
        "2:3": "1360x2048",
        "16:9": "2048x1152",
        "9:16": "1152x2048",
        "4:3": "2048x1536",
        "3:4": "1536x2048",
        "21:9": "2048x880",
        "5:4": "2560x2048",
        "4:5": "2048x2560",
        "2:1": "4096x2048",
        "1:2": "2048x4096",
    },
    "4k": {
        "1:1": "2880x2880",
        "3:2": "3520x2336",
        "2:3": "2336x3520",
        "16:9": "3840x2160",
        "9:16": "2160x3840",
        "4:3": "3312x2480",
        "3:4": "2480x3312",
        "21:9": "3840x1648",
        "5:4": "3600x2880",
        "4:5": "2880x3600",
        "2:1": "5760x2880",
        "1:2": "2880x5760",
    },
}


def get_pixel_size(aspect_ratio: str, resolution: str) -> str:
    """根据比例和分辨率获取像素尺寸"""
    res_key = resolution.lower().replace("k", "") + "k"
    size = SIZE_MAP.get(res_key, {}).get(aspect_ratio, "1024x1024")
    return size


# ==================== 核心功能 ====================


def ensure_folders():
    """确保所有必要的文件夹存在"""
    for folder in [INPUT_FOLDER, OUTPUT_FOLDER, COMPLETED_FOLDER, FAILED_FOLDER]:
        Path(folder).mkdir(parents=True, exist_ok=True)
    print(f"✓ 文件夹已就绪")
    print(f"  输入: {os.path.abspath(INPUT_FOLDER)}")
    print(f"  输出: {os.path.abspath(OUTPUT_FOLDER)}")
    print(f"  已完成: {os.path.abspath(COMPLETED_FOLDER)}")
    print(f"  失败: {os.path.abspath(FAILED_FOLDER)}")


def get_image_files() -> List[Path]:
    """获取输入文件夹中的所有图片文件"""
    input_path = Path(INPUT_FOLDER)
    files: set[Path] = set()
    for ext in SUPPORTED_EXTENSIONS:
        files.update(input_path.glob(f"*{ext}"))
        files.update(input_path.glob(f"*{ext.upper()}"))
    return sorted(files)


def submit_task(file_path: Path, pixel_size: str) -> Optional[str]:
    """提交异步图生图任务（直接上传图片文件），返回 task_id"""
    try:
        # 确定 MIME 类型
        mime_type, _ = mimetypes.guess_type(str(file_path))
        if not mime_type:
            mime_type = "image/png"

        # 构建 multipart/form-data
        with open(file_path, "rb") as f:
            files = {
                "image": (file_path.name, f, mime_type),
            }
            data = {
                "model": MODEL,
                "prompt": PROMPT,
                "size": pixel_size,
                "n": "1",
                "response_format": "url",
            }

            response = requests.post(
                f"{API_BASE_URL}/image-tasks/edits",
                headers={"Authorization": f"Bearer {API_KEY}"},
                files=files,
                data=data,
                timeout=60,
            )

        response.raise_for_status()
        result = response.json()

        # 兼容 { id: "..." } 和 { code: 0, data: { id: "..." } } 两种格式
        task_id = result.get("id") or (result.get("data") or {}).get("id")
        if task_id:
            print(f"  ✓ 任务已提交: {file_path.name} → {task_id}")
        else:
            print(f"  ✗ 未返回任务 ID: {json.dumps(result, ensure_ascii=False)[:200]}")
        return task_id

    except Exception as e:
        print(f"  ✗ 提交失败 {file_path.name}: {e}")
        return None


def poll_task(task_id: str) -> Optional[str]:
    """轮询任务状态，返回结果图片 URL"""
    start_time = time.time()

    while time.time() - start_time < MAX_POLL_TIME:
        try:
            response = requests.get(
                f"{API_BASE_URL}/image-tasks/{task_id}",
                headers={"Authorization": f"Bearer {API_KEY}"},
                timeout=30,
            )
            response.raise_for_status()
            raw = response.json()

            # 兼容扁平格式和嵌套格式 { code, data: { status, result } }
            data = raw
            if isinstance(raw.get("data"), dict) and "status" in raw["data"]:
                data = raw["data"]

            status = (data.get("status") or "").lower()

            if status in ["completed", "succeeded", "success"]:
                # 提取图片 URL：兼容 result.data[0].url 和 output.data[0].url
                result_obj = data.get("result") or data.get("output") or {}
                result_data = result_obj.get("data", []) if isinstance(result_obj, dict) else []

                if isinstance(result_data, list) and len(result_data) > 0:
                    url = result_data[0].get("url") or result_data[0].get("b64_json")
                    if url and url.startswith("http"):
                        return url

                print(f"  ⚠ 任务完成但无法解析结果: {task_id}")
                print(f"    响应: {json.dumps(data, ensure_ascii=False)[:300]}")
                return None

            elif status in ["failed", "error"]:
                error_msg = (data.get("error") or {}).get("message") or data.get("message") or "未知错误"
                print(f"  ✗ 任务失败 {task_id}: {error_msg}")
                return None

            # pending / processing / running → 继续轮询
            elapsed = int(time.time() - start_time)
            if elapsed % 30 == 0 and elapsed > 0:
                print(f"  ... 等待中 ({elapsed}s, status={status})")

            time.sleep(POLL_INTERVAL)

        except Exception as e:
            print(f"  ⚠ 轮询出错 {task_id}: {e}")
            time.sleep(POLL_INTERVAL)

    print(f"  ✗ 任务超时 {task_id} (>{MAX_POLL_TIME}s)")
    return None


def download_image(url: str, save_path: Path) -> bool:
    """下载图片到指定路径"""
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        with open(save_path, "wb") as f:
            f.write(response.content)
        return True
    except Exception as e:
        print(f"  ✗ 下载失败: {e}")
        return False


def process_single_image(
    file_path: Path, index: int, total: int, pixel_size: str
) -> Tuple[bool, str, Optional[Path]]:
    """处理单张图片，返回 (成功, 文件名, 输出路径)"""
    original_name = file_path.stem
    print(f"\n[{index}/{total}] 处理: {file_path.name}")

    # 提交异步任务（直接上传图片文件）
    for attempt in range(MAX_RETRIES):
        if attempt > 0:
            print(f"  → 重试 ({attempt + 1}/{MAX_RETRIES})...")
            time.sleep(3 * (attempt + 1))

        task_id = submit_task(file_path, pixel_size)
        if not task_id:
            continue

        # 轮询结果
        print(f"  → 等待生成结果...")
        result_url = poll_task(task_id)
        if not result_url:
            continue

        # 下载结果 - 文件名与源图片一致，扩展名改为 .png
        output_name = f"{original_name}.png"
        output_path = Path(OUTPUT_FOLDER) / output_name
        # 如果输出文件已存在，加序号避免覆盖
        if output_path.exists():
            seq = 1
            while output_path.exists():
                output_name = f"{original_name}_{seq}.png"
                output_path = Path(OUTPUT_FOLDER) / output_name
                seq += 1

        print(f"  → 下载结果...")
        if download_image(result_url, output_path):
            print(f"  ✓ 完成: {output_name}")
            return True, original_name, output_path
        else:
            continue

    print(f"  ✗ {MAX_RETRIES} 次尝试均失败")
    return False, original_name, None


def move_to_completed(file_path: Path):
    """将原图移动到已完成文件夹"""
    if not file_path.exists():
        return
    dest = Path(COMPLETED_FOLDER) / file_path.name
    # 如果目标已存在，添加时间戳
    if dest.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = Path(COMPLETED_FOLDER) / f"{file_path.stem}_{timestamp}{file_path.suffix}"
    shutil.move(str(file_path), str(dest))


def move_to_failed(file_path: Path):
    """将失败的原图移动到失败文件夹"""
    if not file_path.exists():
        return
    dest = Path(FAILED_FOLDER) / file_path.name
    # 如果目标已存在，添加时间戳
    if dest.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = Path(FAILED_FOLDER) / f"{file_path.stem}_{timestamp}{file_path.suffix}"
    shutil.move(str(file_path), str(dest))


def main():
    """主函数"""
    print("=" * 50)
    print("批量图生图处理脚本 (manxiaobai 异步版)")
    print("=" * 50)

    # 检查配置
    if API_KEY == "your-api-key-here":
        print("\n✗ 错误: 请先修改脚本中的 API_KEY 配置")
        sys.exit(1)

    # 确保文件夹存在
    ensure_folders()

    # 计算像素尺寸
    pixel_size = get_pixel_size(ASPECT_RATIO, RESOLUTION)

    # 获取图片列表
    image_files = get_image_files()
    if not image_files:
        print(f"\n⚠ 输入文件夹为空: {os.path.abspath(INPUT_FOLDER)}")
        print("请将图片放入输入文件夹后重新运行")
        return

    print(f"\n找到 {len(image_files)} 张图片待处理")
    print(f"批量大小: {BATCH_SIZE}")
    print(f"提示词: {PROMPT}")
    print(f"宽高比: {ASPECT_RATIO} → 像素尺寸: {pixel_size}")
    print(f"分辨率: {RESOLUTION}")
    print(f"模型: {MODEL}")
    print("-" * 50)

    # 统计
    success_count = 0
    fail_count = 0
    start_time = time.time()

    # 分批处理
    for batch_start in range(0, len(image_files), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(image_files))
        batch_files = image_files[batch_start:batch_end]

        print(f"\n>>> 批次 {batch_start // BATCH_SIZE + 1}: 处理 {len(batch_files)} 张图片")

        # 并行处理当前批次
        with ThreadPoolExecutor(max_workers=BATCH_SIZE) as executor:
            futures = {
                executor.submit(
                    process_single_image, file_path, batch_start + i + 1, len(image_files), pixel_size
                ): file_path
                for i, file_path in enumerate(batch_files)
            }

            for future in as_completed(futures):
                file_path = futures[future]
                try:
                    success, original_name, output_path = future.result()
                    if success:
                        success_count += 1
                        # 移动原图到已完成文件夹
                        move_to_completed(file_path)
                    else:
                        fail_count += 1
                        # 移动原图到失败文件夹
                        move_to_failed(file_path)
                except Exception as e:
                    print(f"  ✗ 处理异常 {file_path.name}: {e}")
                    fail_count += 1
                    # 移动原图到失败文件夹
                    move_to_failed(file_path)

        # 批次间间隔 1 秒
        if batch_end < len(image_files):
            time.sleep(1)

    # 输出统计
    elapsed = time.time() - start_time
    print("\n" + "=" * 50)
    print("处理完成!")
    print("=" * 50)
    print(f"总计: {len(image_files)} 张")
    print(f"成功: {success_count} 张")
    print(f"失败: {fail_count} 张")
    print(f"耗时: {elapsed:.1f} 秒")
    print(f"\n结果保存在: {os.path.abspath(OUTPUT_FOLDER)}")
    print(f"原图已移动到: {os.path.abspath(COMPLETED_FOLDER)}")
    if fail_count > 0:
        print(f"失败图片在: {os.path.abspath(FAILED_FOLDER)}")


if __name__ == "__main__":
    main()
