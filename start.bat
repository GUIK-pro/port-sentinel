@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title 东莞首靠船识别助手 · 一键启动

:: ============================================================
::  东莞首靠船识别助手 · 一键启动脚本
::  功能：自动启动 Nanobot API + 本地 Web 服务 + 打开浏览器
::  用法：双击运行，或在命令行执行 start.bat
::  停止：执行 stop.bat 或关闭所有启动窗口
:: ============================================================

set "PROJECT_DIR=%~dp0"
set "HTTP_PORT=8080"
set "NANOBOT_PORT=8900"
set "NANOBOT_HOST=127.0.0.1"
set "PID_FILE=%PROJECT_DIR%.pids"

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║    东莞首靠船识别助手 · 一键启动                 ║
echo  ║    Nanobot AI + Web Dashboard                    ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: ============================================================
::  Step 1: 检查 Python 环境
:: ============================================================
echo [1/6] 检查 Python 环境...

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 未找到 Python，请先安装 Python 3.11+
    echo  下载地址：https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set "PY_VER=%%v"
echo  Python 版本: %PY_VER%

:: 检查版本 >= 3.11
for /f "tokens=1,2 delims=." %%a in ("%PY_VER%") do (
    set "PY_MAJOR=%%a"
    set "PY_MINOR=%%b"
)
if !PY_MAJOR! lss 3 (
    echo  [错误] Python 版本过低，需要 3.11+（当前 %PY_VER%）
    pause
    exit /b 1
)
if !PY_MAJOR! equ 3 if !PY_MINOR! lss 11 (
    echo  [警告] Python 版本 %PY_VER%，推荐 3.11+（尝试继续运行...）
)

:: ============================================================
::  Step 2: 检查 Nanobot 是否已安装
:: ============================================================
echo [2/6] 检查 Nanobot AI...

python -c "import nanobot; print('ok')" >nul 2>&1
if %errorlevel% neq 0 (
    echo  Nanobot 未安装，正在安装 nanobot-ai[api]...
    echo.
    pip install "nanobot-ai[api]"
    if %errorlevel% neq 0 (
        echo.
        echo  [错误] Nanobot 安装失败，请手动执行：
        echo    pip install "nanobot-ai[api]"
        echo.
        echo  如果网络不通，可参考 Nanobot部署指引.md 中的离线方案
        echo.
        pause
        exit /b 1
    )
    echo  Nanobot 安装完成！
    echo.
    
    :: 首次安装需要初始化配置
    echo  首次安装，正在初始化 Nanobot 配置...
    nanobot onboard
    echo.
    echo  [重要] 请确保已配置 LLM 提供商 API Key
    echo  配置文件位置：%USERPROFILE%\.nanobot\config.json
    echo  详见 Nanobot部署指引.md 第三节
    echo.
)

:: ============================================================
::  Step 3: 检查端口占用
:: ============================================================
echo [3/6] 检查端口占用...

:: 检查 8900 (Nanobot)
netstat -ano | findstr ":%NANOBOT_PORT% " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo  Nanobot 端口 %NANOBOT_PORT% 已被占用，跳过启动
    set "SKIP_NANOBOT=1"
) else (
    set "SKIP_NANOBOT=0"
    echo  Nanobot 端口 %NANOBOT_PORT% 可用
)

:: 检查 8080 (HTTP Server)
netstat -ano | findstr ":%HTTP_PORT% " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo  HTTP 端口 %HTTP_PORT% 已被占用
    echo  尝试使用备用端口 8088...
    set "HTTP_PORT=8088"
    netstat -ano | findstr ":%HTTP_PORT% " | findstr "LISTENING" >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [错误] 端口 8080 和 8088 均被占用，请手动释放后重试
        pause
        exit /b 1
    )
    echo  使用备用端口 %HTTP_PORT%
) else (
    echo  HTTP 端口 %HTTP_PORT% 可用
)

:: ============================================================
::  Step 4: 启动 Nanobot API 服务
:: ============================================================
if "%SKIP_NANOBOT%"=="1" (
    echo [4/6] Nanobot 已在运行，跳过启动
) else (
    echo [4/6] 启动 Nanobot API 服务...
    
    :: 在新窗口中启动 nanobot serve
    start "Nanobot API Server (port %NANOBOT_PORT%)" cmd /c "title Nanobot API Server & echo Nanobot API 服务启动中... & echo 端口: %NANOBOT_PORT% & echo 按 Ctrl+C 可停止服务 & echo. & nanobot serve --host %NANOBOT_HOST% --port %NANOBOT_PORT%"
    
    :: 等待 Nanobot 就绪（最多等 20 秒）
    echo  等待 Nanobot 就绪...
    set "NB_READY=0"
    for /L %%i in (1,1,20) do (
        if "!NB_READY!"=="0" (
            timeout /t 1 /nobreak >nul
            netstat -ano | findstr ":%NANOBOT_PORT% " | findstr "LISTENING" >nul 2>&1
            if !errorlevel! equ 0 (
                set "NB_READY=1"
                echo  Nanobot API 已就绪！(耗时约 %%i 秒)
            )
        )
    )
    if "!NB_READY!"=="0" (
        echo  [警告] Nanobot 可能未成功启动（20 秒超时）
        echo  请检查新打开的 Nanobot 窗口是否有错误信息
        echo  常见问题：LLM API Key 未配置，请编辑 %USERPROFILE%\.nanobot\config.json
        echo.
        echo  即使 Nanobot 未启动，前端页面仍可正常浏览（AI 对话功能暂不可用）
        echo.
        echo  配置向导已为您打开 → nanobot-config.html
        start "" "http://localhost:%HTTP_PORT%/nanobot-config.html"
        echo.
    )
)

:: ============================================================
::  Step 5: 启动本地 Web 服务器
:: ============================================================
echo [5/6] 启动本地 Web 服务器...
echo  项目目录: %PROJECT_DIR%
echo  访问地址: http://localhost:%HTTP_PORT%

:: 在新窗口中启动代理服务器（静态文件 + Nanobot API 代理，解决 CORS 问题）
start "DGMSA Web Server (port %HTTP_PORT%)" cmd /c "title DGMSA Web Server & echo Web 服务已启动（含 API 代理） & echo 地址: http://localhost:%HTTP_PORT% & echo 目录: %PROJECT_DIR% & echo 按 Ctrl+C 可停止服务 & echo. & cd /d "%PROJECT_DIR%" & python server.py --port %HTTP_PORT%"

:: 短暂等待 HTTP 服务就绪
timeout /t 2 /nobreak >nul

:: ============================================================
::  Step 6: 打开浏览器
:: ============================================================
echo [6/6] 打开浏览器...

:: 检查 Nanobot 连通性
set "NB_STATUS=离线"
curl -s http://%NANOBOT_HOST%:%NANOBOT_PORT%/health >nul 2>&1
if %errorlevel% equ 0 (
    set "NB_STATUS=在线"
)

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║    启动完成！                                    ║
echo  ╠══════════════════════════════════════════════════╣
echo  ║                                                  ║
echo  ║    Web 前端:  http://localhost:%HTTP_PORT%         ║
echo  ║    Nanobot:   %NB_STATUS% (端口 %NANOBOT_PORT%)           ║
echo  ║                                                  ║
echo  ║    入口页面:                                      ║
echo  ║    · 登录页   http://localhost:%HTTP_PORT%/login.html
echo  ║    · 指挥台   http://localhost:%HTTP_PORT%/index.html
echo  ║    · 大屏     http://localhost:%HTTP_PORT%/daily-dashboard.html
echo  ║                                                  ║
echo  ║    停止服务:  执行 stop.bat                       ║
echo  ║                                                  ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: 打开浏览器到登录页
start "" "http://localhost:%HTTP_PORT%/login.html"

echo  提示: 此窗口可以关闭，不影响已启动的服务。
echo  如需停止所有服务，请执行 stop.bat
echo.

endlocal
