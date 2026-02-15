import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * 获取项目根目录
 * 从当前文件向上查找，直到找到 package.json
 */
export function getProjectRoot(): string {
  // 在 ESM 模块中获取当前文件路径
  const currentFilePath = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(currentFilePath);

  // 向上查找 package.json
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // 兜底：返回当前工作目录
  return process.cwd();
}

/**
 * 将相对路径解析为绝对路径
 *
 * 支持的格式：
 * - ./path/to/file    → 相对于项目根目录
 * - ../path/to/file   → 相对于项目根目录的父目录
 * - path/to/file      → 相对于项目根目录（无前缀也视为相对路径）
 * - D:\path\to\file   → 已是绝对路径，直接返回
 *
 * @param inputPath 输入路径（可能是相对或绝对路径）
 * @returns 绝对路径
 */
export function resolveProjectPath(inputPath: string): string {
  // 如果已经是绝对路径，直接返回
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  // 获取项目根目录
  const projectRoot = getProjectRoot();

  // 解析相对路径
  return path.resolve(projectRoot, inputPath);
}

/**
 * 尝试解析命令的可执行路径
 * 优先查找 PATH，其次查找常见虚拟环境
 */
// Exported for path resolution
export function resolveCommand(command: string): string {
  if (!command) return command;

  // 1. 如果是绝对路径，直接返回
  if (path.isAbsolute(command)) {
    return command;
  }

  // 2. 如果包含路径分隔符，视为相对路径解析
  if (command.includes('/') || command.includes('\\')) {
    return resolveProjectPath(command);
  }

  // 3. 尝试从 PATH 查找
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const stdout = execSync(`${cmd} ${command}`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' });
    const found = stdout.split('\n')[0].trim();
    if (found && fs.existsSync(found)) {
      return found;
    }
  } catch {
    // ignore
  }

  // 4. 查找常见虚拟环境
  const projectRoot = getProjectRoot();
  const isWin = process.platform === 'win32';
  const binDir = isWin ? 'Scripts' : 'bin';
  const ext = isWin ? '.exe' : '';

  const candidates = [
    // 项目内 venv
    path.join(projectRoot, '.venv', binDir, command + ext),
    path.join(projectRoot, 'venv', binDir, command + ext),
    // 项目内 env (可能是 embedded python 或 conda env)
    path.join(projectRoot, 'env', binDir, command + ext),
    path.join(projectRoot, 'env', command + ext),
    // 特定开发环境 fallback (for specific dev machine)
    `D:\\ProgramSoftware\\Conda\\envs\\supernote\\Scripts\\${command}${ext}`,
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 5. 找不到则返回原命令
  return command;
}
