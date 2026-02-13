# SuperNote 安装与配置指南

本指南将帮助你从零开始配置 SuperNote，特别关注 **FFmpeg** 的设置以及 **CUDA (GPU) 加速** 的配置。

---

## 1. 快速检查 (推荐)

如果你已经安装了 Python 和 Node.js，可以启动后端后访问 `http://localhost:3000/api/settings/env-check` (GET) 来查看当前环境的检测结果。

---

## 2. 安装依赖

### 2.1 Node.js & npm
- 访问 [Node.js 官网](https://nodejs.org/) 下载并安装 v18 或更高版本。

### 2.2 Python (用于 Whisper 转写)
- 访问 [Python 官网](https://www.python.org/) 下载并安装 v3.10 或更高版本。
- **注意**：在安装时务必勾选 "Add Python to PATH"。

---

## 3. FFmpeg 配置

SuperNote 需要 FFmpeg 来提取音频和视频帧。

### Windows 用户 (推荐方式)
本项目已在 `tools/ffmpeg/bin/` 目录下内置了 Windows 版 FFmpeg。
- 如果你是 Windows 用户，通常无需额外安装。
- 如果内置的无法工作，请访问 [Gyan.dev](https://www.gyan.dev/ffmpeg/builds/) 下载 `ffmpeg-git-full.7z`，解压并将 `bin` 目录下的 `ffmpeg.exe` 路径填写到系统设置中。

### macOS 用户
使用 Homebrew 安装：
```bash
brew install ffmpeg
```

### Linux 用户
```bash
sudo apt update
sudo apt install ffmpeg git python3 python3-pip python3-venv
```

---

## 4. Whisper 与 CUDA 加速配置

Whisper 是用于音频转文字的模型，使用 GPU (CUDA) 可以极大提升转写速度。

### 4.1 安装 Whisper
在终端执行：
```bash
pip install -r requirements.txt
```
或直接安装：
```bash
pip install -U openai-whisper
```

### 4.2 配置 CUDA 加速 (NVIDIA 显卡用户)

如果你有 NVIDIA 显卡，建议配置 CUDA 加速：

1. **检查显卡驱动**：确保你的 NVIDIA 驱动是最新的。
2. **安装 PyTorch (CUDA版)**：
   访问 [PyTorch 官网](https://pytorch.org/get-started/locally/)，根据你的系统选择对应的安装命令。
   例如 (Windows/Linux, CUDA 12.1):
   ```bash
   pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
   ```
3. **验证 CUDA**：
   在命令行运行以下 Python 代码：
   ```bash
   python -c "import torch; print('CUDA 可用:', torch.cuda.is_available()); print('显卡名称:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else '无')"
   ```
   如果显示 `CUDA 可用: True`，则说明配置成功。

---

## 5. 项目初始化

1. **安装后端依赖**：
   ```bash
   npm install
   ```

2. **安装前端依赖**：
   ```bash
   cd apps/web
   npm install
   cd ../..
   ```

---

## 6. 系统配置

1. 启动项目：
   - 后端：`npm run dev` (在根目录)
   - 前端：`cd apps/web && npm run dev`
2. 打开浏览器进入前端页面，点击右上角图标进入 **系统设置 -> 本地引擎与集成**。
3. **本地转写配置**：
   - **命令**：输入 `whisper` 的完整路径。如果你不知道路径，在终端输入 `where whisper` (Windows) 或 `which whisper` (macOS/Linux)。
   - **FFmpeg 路径**：输入 `ffmpeg` 的完整路径。Windows 默认可填：`tools/ffmpeg/bin/ffmpeg.exe`。
   - **计算设备**：
     - 如果你成功配置了 CUDA，请选择 `cuda`。
     - 否则选择 `cpu` 或 `auto`。
4. 点击 **测试命令**，确保两个工具都能正常调用。

---

## 常见问题 (FAQ)

**Q: 运行 Whisper 时提示 `FileNotFoundError: [WinError 2] 系统找不到指定的文件` (关于 ffmpeg)**
A: 这是因为 Whisper 找不到 FFmpeg。请确保：
1. 系统设置中的 FFmpeg 路径正确。
2. 或者将 FFmpeg 所在目录手动加入到系统的环境变量 `PATH` 中。

**Q: 转写速度非常慢**
A: 请检查是否使用了 GPU 加速。在设置中将设备改为 `cuda`，并确保按照第 4.2 节安装了 CUDA 版 PyTorch。如果显存较小 (小于 4GB)，建议模型选择 `base` 或 `tiny`。

---

## 7. Linux 详细部署建议

对于 Linux (如 Ubuntu 22.04+) 用户，建议按照以下流程操作：

1. **创建虚拟环境** (推荐):
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
2. **处理权限**:
   确保 `start.sh` 脚本具有执行权限：
   ```bash
   chmod +x start.sh
   ```
3. **环境变量**:
   如果你的 ffmpeg 安装在非标准路径，可以在 `.env` 文件中设置 `FFMPEG_BIN`。
