#!/bin/bash

# SuperNote 启动脚本 (Linux/macOS)

BACKEND_PORT=3001
FRONTEND_PORT=3000

echo "正在启动后端服务 (端口 $BACKEND_PORT)..."
PORT=$BACKEND_PORT npm run dev &
BACKEND_PID=$!

# 等待后端就绪
echo "等待后端健康检查..."
sleep 5

echo "正在启动前端服务 (端口 $FRONTEND_PORT)..."
cd apps/web && npm run dev -- --port $FRONTEND_PORT --strictPort &
FRONTEND_PID=$!

echo "=========================================="
echo "SuperNote 已启动！"
echo "前端地址: http://localhost:$FRONTEND_PORT"
echo "后端地址: http://localhost:$BACKEND_PORT"
echo "按 Ctrl+C 停止所有服务"
echo "=========================================="

# 捕获退出信号
trap "kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

wait
