# SuperNote Installation & Configuration Guide

This guide will help you configure SuperNote from scratch, with a focus on **FFmpeg** setup and **CUDA (GPU) acceleration**.

---

## 1. Quick Check (Recommended)

If you have Python and Node.js installed, you can start the backend and visit `http://localhost:3000/api/settings/env-check` (GET) to see the environment detection results.

---

## 2. Prerequisites

### 2.1 Node.js & npm
- Download and install v18 or higher from the [Node.js official website](https://nodejs.org/).

### 2.2 Python (for Whisper)
- Download and install v3.10 or higher from the [Python official website](https://www.python.org/).
- **Note**: Ensure "Add Python to PATH" is checked during installation.

---

## 3. FFmpeg Configuration

SuperNote requires FFmpeg for audio extraction and video frame capturing.

### Windows Users (Recommended)
This project includes a bundled version of FFmpeg for Windows in the `tools/ffmpeg/bin/` directory.
- Windows users usually don't need to install it separately.
- If the bundled version doesn't work, download `ffmpeg-git-full.7z` from [Gyan.dev](https://www.gyan.dev/ffmpeg/builds/), extract it, and set the path to `ffmpeg.exe` in the application settings.

### macOS Users
Install via Homebrew:
```bash
brew install ffmpeg
```

### Linux Users
```bash
sudo apt update && sudo apt install ffmpeg
```

---

## 4. Whisper and CUDA Acceleration

Whisper is used for Speech-to-Text. Using a GPU (CUDA) can significantly speed up the process.

### 4.1 Install Whisper
Run in your terminal:
```bash
pip install -r requirements.txt
```
Or install directly:
```bash
pip install -U openai-whisper
```

### 4.2 Configure CUDA Acceleration (for NVIDIA Users)

If you have an NVIDIA GPU, follow these steps to enable CUDA acceleration:

1. **Check GPU Drivers**: Ensure your NVIDIA drivers are up to date.
2. **Install PyTorch (CUDA version)**:
   Visit the [PyTorch website](https://pytorch.org/get-started/locally/) and select the command for your system.
   Example (Windows/Linux, CUDA 12.1):
   ```bash
   pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
   ```
3. **Verify CUDA**:
   Run the following Python code in your terminal:
   ```bash
   python -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('Device name:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'None')"
   ```
   If it shows `CUDA available: True`, your configuration is correct.

---

## 5. Project Initialization

1. **Install Backend Dependencies**:
   ```bash
   npm install
   ```

2. **Install Frontend Dependencies**:
   ```bash
   cd apps/web
   npm install
   cd ../..
   ```

---

## 6. System Settings

1. Start the project:
   - Backend: `npm run dev` (in root)
   - Frontend: `cd apps/web && npm run dev`
2. Open your browser and go to the frontend, click the settings icon -> **Local Engine & Integrations**.
3. **Local Transcriber Settings**:
   - **Command**: Enter the full path to `whisper`. Use `where whisper` (Windows) or `which whisper` (macOS/Linux) to find it.
   - **FFmpeg Path**: Enter the full path to `ffmpeg`. For Windows, you can use: `tools/ffmpeg/bin/ffmpeg.exe`.
   - **Compute Device**:
     - Choose `cuda` if you configured CUDA.
     - Otherwise, choose `cpu` or `auto`.
4. Click **Test Command** to verify both tools are working.

---

## FAQ

**Q: Whisper fails with `FileNotFoundError: [WinError 2] The system cannot find the file specified` (related to ffmpeg)**
A: Whisper cannot find FFmpeg. Ensure:
1. The FFmpeg path in settings is correct.
2. Or add the directory containing FFmpeg to your system's `PATH` environment variable.

**Q: Transcription is very slow**
A: Check if GPU acceleration is enabled. Set the device to `cuda` in settings and ensure CUDA-enabled PyTorch is installed (Section 4.2). If your VRAM is low (less than 4GB), use `base` or `tiny` models.
