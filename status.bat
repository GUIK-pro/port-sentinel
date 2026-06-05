@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title 东莞首靠船识别助手 · 服务状态

:: ============================================================
::  东莞首靠船识别助手 · 服务状态检查
:: ============================================================

set "NANOBOT_PORT=8900"
set "HTTP_PORT=8080"

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║    东莞首靠船识别助手 · 服务状态                 ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: ============================================================
::  Python 环境
:: ============================================================
echo [环境] Python...
python --version 2>&1 | findstr "." >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  √ %%v
) else (
    echo  × 未安装
)

:: ============================================================
::  Nanobot 安装状态
:: ============================================================
echo [环境] Nanobot AI...
python -c "import nanobot; print('√ nanobot-ai 已安装')" 2>nul
if %errorlevel% neq 0 (
    echo  × nanobot-ai 未安装
)

:: ============================================================
::  Nanobot 配置文件
:: ============================================================
echo [配置] Nanobot config...
if exist "%USERPROFILE%\.nanobot\config.json" (
    echo  √ %USERPROFILE%\.nanobot\config.json
    :: 检查是否有 API Key
    findstr /i "api_key" "%USERPROFILE%\.nanobot\config.json" >nul 2>&1
    if %errorlevel% equ 0 (
        echo    (已配置 API Key)
    ) else (
        echo    [警告] 未检测到 API Key，请编辑配置文件添加 LLM 密钥
    )
) else (
    echo  × 配置文件不存在
    echo    请执行 nanobot onboard 初始化
)

:: ============================================================
::  Nanobot API 服务
:: ============================================================
echo.
echo [服务] Nanobot API (端口 %NANOBOT_PORT%)...
set "NB_PID="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%NANOBOT_PORT% " ^| findstr "LISTENING"') do (
    set "NB_PID=%%p"
)
if defined NB_PID (
    echo  √ 运行中 (PID !NB_PID!)
    :: 测试 API 连通
    curl -s http://127.0.0.1:%NANOBOT_PORT%/health >nul 2>&1
    if !errorlevel! equ 0 (
        echo    API 响应正常
    ) else (
        echo    [警告] 端口监听中但 API 无响应
    )
) else (
    echo  × 未运行
    echo    启动命令: nanobot serve
)

:: ============================================================
::  Web 服务器
:: ============================================================
echo [服务] Web 服务器...
set "WEB_FOUND=0"
for %%P in (8080 8088) do (
    set "WEB_PID="
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%%P " ^| findstr "LISTENING"') do (
        set "WEB_PID=%%p"
    )
    if defined WEB_PID (
        echo  √ 端口 %%P 运行中 (PID !WEB_PID!)
        echo    访问: http://localhost:%%P/login.html
        set "WEB_FOUND=1"
    )
)
if "!WEB_FOUND!"=="0" (
    echo  × 未运行
    echo    启动命令: python -m http.server 8080
)

:: ============================================================
::  数据状态
:: ============================================================
echo.
echo [数据] localStorage 使用情况...
echo  (需通过浏览器开发者工具查看)
echo  · dgmsa_plans   - 进出港计划滚动库
echo  · dgmsa_uploads - 上传历史记录
echo  · dgmsa_rules_v1 - 规则库
echo  · dgmsa_auth    - 当前登录用户
echo  · dgmsa_users   - 注册用户列表

echo.
echo  ══════════════════════════════════════════════════
echo.
echo  快速操作:
echo    启动服务:  start.bat
echo    停止服务:  stop.bat
echo    查看状态:  status.bat (本脚本)
echo.

endlocal
pause
