@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

echo.
echo ╔══════════════════════════════════════════════════╗
echo ║    Nanobot 配置诊断工具                         ║
echo ╚══════════════════════════════════════════════════╝
echo.

:: 1. 检查 Python
echo [1/6] Python 环境
python --version 2>nul
if %errorlevel% neq 0 (
    echo  × Python 未安装
    pause
    exit /b 1
)
echo   Python 已安装
echo.

:: 2. 检查 Nanobot 安装位置
echo [2/6] Nanobot 安装位置
for /f "delims=" %%i in ('where nanobot 2^>nul') do (
    echo  找到: %%i
)
echo.

:: 3. 检查配置文件
echo [3/6] 配置文件检查
set "CONFIG_PATH=%USERPROFILE%\.nanobot\config.json"
if exist "%CONFIG_PATH%" (
    echo  √ 配置文件存在: %CONFIG_PATH%
    echo.
    echo  配置内容预览:
    type "%CONFIG_PATH%" | findstr /i "provider model apiKey"
) else (
    echo  × 配置文件不存在: %CONFIG_PATH%
    echo  请先运行: nanobot onboard
    echo  或使用 nanobot-config.html 生成配置
)
echo.

:: 4. 检查端口占用
echo [4/6] 端口 8900 状态
netstat -ano | findstr ":8900 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo  ! 端口 8900 已被占用
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8900 " ^| findstr "LISTENING"') do (
        echo    PID: %%p
        tasklist /FI "PID eq %%p" | findstr /i "python"
    )
) else (
    echo  √ 端口 8900 空闲
)
echo.

:: 5. 测试 API 连通
echo [5/6] API 连通性测试
curl -s http://127.0.0.1:8900/health >nul 2>&1
if %errorlevel% equ 0 (
    echo  √ Nanobot API 运行正常
    curl -s http://127.0.0.1:8900/health
) else (
    echo  × Nanobot API 未运行
    echo  请运行: nanobot serve
)
echo.

:: 6. 检查项目文件
echo [6/6] 项目文件检查
set "PROJECT_DIR=%~dp0"
if exist "%PROJECT_DIR%nanobot-main" (
    echo   发现本地 Nanobot 源码: %PROJECT_DIR%nanobot-main
    echo  注意: 全局 nanobot 和本地源码可能冲突
)
echo  √ 项目目录: %PROJECT_DIR%
echo.

echo ══════════════════════════════════════════════════
echo.
echo 下一步操作:
echo   · 如果配置文件不存在 → 运行 nanobot-config.html
echo   · 如果端口被占用 → 先执行 stop.bat 停止旧实例
echo   · 如果 API 未运行 → 执行 start.bat 启动服务
echo.

endlocal
pause
