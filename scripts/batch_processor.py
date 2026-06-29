#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
批量图生图处理脚本

功能：
- 从输入文件夹读取图片
- 调用 API 生成新图片
- 保存结果到输出文件夹
- 将处理完成的原图移动到已完成文件夹

使用方法：
1. 安装依赖：pip install requests pillow
2. 修改下方配置项
3. 运行：python batch_processor.py
"""

import os
import sys
import time
import json
import shutil
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

# ==================== 配置项 ====================

# API 配置
API_BASE_URL = "https://api.apimart.ai"  # API 地址
API_KEY = "your-api-key-here"  # 替换为你的 API Key

# 生成参数
PROMPT = "将图片转换为吉卜力动画风格"  # 提示词
ASPECT_RATIO = "1:1"  # 宽高比：1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3
RESOLUTION = "2k"  # 分辨率：1k, 2k, 4k

# 文件夹配置（相对于脚本运行目录）
INPUT_FOLDER = "./input"  # 输入文件夹
OUTPUT_FOLDER = "./output"  # 输出文件夹
COMPLETED_FOLDER = "./completed"  # 已完成原图文件夹

# 处理配置
BATCH_SIZE = 5  # 每批处理图片数量
MAX_RETRIES = 3  # 最大重试次数
POLL_INTERVAL = 5  # 轮询间隔（秒）
MAX_POLL_TIME = 300  # 最大轮询时间（秒）

# 支持的图片格式
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# ==================== 核心功能 ====================


def ensure_folders():
    """确保所有必要的文件夹存在"""
    for folder in [INPUT_FOLDER, OUTPUT_FOLDER, COMPLETED_FOLDER]:
        Path(folder).mkdir(parents=True, exist_ok=True)
    print(f"✓ 文件夹已就绪")
    print(f"  输入: {os.path.abspath(INPUT_FOLDER)}")
    print(f"  输出: {os.path.abspath(OUTPUT_FOLDER)}")
    print(f"  已完成: {os.path.abspath(COMPLETED_FOLDER)}")


def get_image_files() -> List[Path]:
    """获取输入文件夹中的所有图片文件"""
    input_path = Path(INPUT_FOLDER)
    files = []
    for ext in SUPPORTED_EXTENSIONS:
        files.extend(input_path.glob(f"*{ext}"))
        files.extend(input_path.glob(f"*{ext.upper()}"))
    return sorted(files)


def upload_image(file_path: Path) -> Optional[str]:
    """上传图片并返回 URL"""
    try:
        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f)}
            response = requests.post(
                f"{API_BASE_URL}/v1/upload",
                headers={"Authorization": f"Bearer {API_KEY}"},
                files=files,
                timeout=60,
            )
            response.raise_for_status()
            result = response.json()
            return result.get("url")
    except Exception as e:
        print(f"  ✗ 上传失败 {file_path.name}: {e}")
        return None


def submit_task(image_url: str, original_name: str) -> Optional[str]:
    """提交生成任务，返回 task_id"""
    try:
        response = requests.post(
            f"{API_BASE_URL}/v1/images/generations",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-image-2",
                "prompt": PROMPT,
                "n": 1,
                "size": ASPECT_RATIO,
                "resolution": RESOLUTION,
                "image_urls": [image_url],
            },
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()
        task_id = result.get("task_id")
        if task_id:
            print(f"  ✓ 任务已提交: {original_name} → {task_id}")
        return task_id
    except Exception as e:
        print(f"  ✗ 提交失败 {original_name}: {e}")
        return None


def poll_task(task_id: str) -> Optional[str]:
    """轮询任务状态，返回结果图片 URL"""
    start_time = time.time()

    while time.time() - start_time < MAX_POLL_TIME:
        try:
            response = requests.get(
                f"{API_BASE_URL}/v1/tasks/{task_id}",
                headers={"Authorization": f"Bearer {API_KEY}"},
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()

            status = result.get("status", "").lower()

            if status in ["completed", "success", "succeeded"]:
                # 尝试不同的返回格式
                output = result.get("output", {})
                if isinstance(output, dict):
                    images = output.get("images", [])
                    if images:
                        return images[0].get("url")
                elif isinstance(output, str):
                    return output

                # 另一种格式
                data = result.get("data", {})
                if isinstance(data, dict):
                    images = data.get("images", [])
                    if images:
                        return images[0].get("url")

                print(f"  ⚠ 任务完成但无法解析结果: {task_id}")
                return None

            elif status in ["failed", "error"]:
                error = result.get("error", "未知错误")
                print(f"  ✗ 任务失败 {task_id}: {error}")
                return None

            # 继续轮询
            time.sleep(POLL_INTERVAL)

        except Exception as e:
            print(f"  ⚠ 轮询出错 {task_id}: {e}")
            time.sleep(POLL_INTERVAL)

    print(f"  ✗ 任务超时 {task_id}")
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
    file_path: Path, index: int, total: int
) -> Tuple[bool, str, Optional[Path]]:
    """处理单张图片，返回 (成功, 文件名, 输出路径)"""
    original_name = file_path.stem
    print(f"\n[{index}/{total}] 处理: {file_path.name}")

    # 上传
    print(f"  → 上传中...")
    image_url = upload_image(file_path)
    if not image_url:
        return False, original_name, None

    # 提交任务
    print(f"  → 提交生成任务...")
    task_id = submit_task(image_url, original_name)
    if not task_id:
        return False, original_name, None

    # 轮询结果
    print(f"  → 等待生成结果...")
    result_url = poll_task(task_id)
    if not result_url:
        return False, original_name, None

    # 下载结果
    output_name = f"{original_name}_generated.png"
    output_path = Path(OUTPUT_FOLDER) / output_name
    print(f"  → 下载结果...")
    if download_image(result_url, output_path):
        print(f"  ✓ 完成: {output_name}")
        return True, original_name, output_path
    else:
        return False, original_name, None


def move_to_completed(file_path: Path):
    """将原图移动到已完成文件夹"""
    dest = Path(COMPLETED_FOLDER) / file_path.name
    # 如果目标已存在，添加时间戳
    if dest.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = Path(COMPLETED_FOLDER) / f"{file_path.stem}_{timestamp}{file_path.suffix}"
    shutil.move(str(file_path), str(dest))


def main():
    """主函数"""
    print("=" * 50)
    print("批量图生图处理脚本")
    print("=" * 50)

    # 检查配置
    if API_KEY == "your-api-key-here":
        print("\n✗ 错误: 请先修改脚本中的 API_KEY 配置")
        sys.exit(1)

    # 确保文件夹存在
    ensure_folders()

    # 获取图片列表
    image_files = get_image_files()
    if not image_files:
        print(f"\n⚠ 输入文件夹为空: {os.path.abspath(INPUT_FOLDER)}")
        print("请将图片放入输入文件夹后重新运行")
        return

    print(f"\n找到 {len(image_files)} 张图片待处理")
    print(f"批量大小: {BATCH_SIZE}")
    print(f"提示词: {PROMPT}")
    print(f"宽高比: {ASPECT_RATIO}")
    print(f"分辨率: {RESOLUTION}")
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
                    process_single_image, file_path, batch_start + i + 1, len(image_files)
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
                except Exception as e:
                    print(f"  ✗ 处理异常 {file_path.name}: {e}")
                    fail_count += 1

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


if __name__ == "__main__":
    main()
