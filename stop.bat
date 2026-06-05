@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title 东莞首靠船识别助手 · 停止服务

:: ============================================================
::  东莞首靠船识别助手 · 一键停止脚本
::  用法：双击运行
:: ============================================================

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║    东莞首靠船识别助手 · 停止服务                 ║
echo  ╚══════════════════════════════════════════════════╝
echo.

set "STOPPED=0"

:: ============================================================
::  停止 Nanobot API (端口 8900)
:: ============================================================
echo [1/2] 检查 Nanobot API (端口 8900)...

:: 先检查 Python 进程占用的 8900 端口
set "NB_FOUND=0"
for /f "usebackq tokens=2,5" %%a in (`netstat -ano ^| findstr ":8900" ^| findstr "LISTENING"`) do (
    if "!NB_FOUND!"=="0" (
        set "NB_PID=%%b"
        set "NB_FOUND=1"
        echo  找到进程 PID: %%b (端口 8900)
        taskkill /PID %%b /F >nul 2>&1
        if !errorlevel! equ 0 (
            echo  [OK] Nanobot API 已停止
            set /a STOPPED+=1
        ) else (
            echo  [警告] 无法停止 PID %%b，尝试按名称终止...
            taskkill /IM python.exe /FI "WINDOWTITLE eq Nanobot API Server*" /F >nul 2>&1
            if !errorlevel! equ 0 (
                echo  [OK] 已通过窗口标题终止
                set /a STOPPED+=1
            ) else (
                echo  [提示] 请手动关闭 Nanobot 窗口
            )
        )
    )
)
if "!NB_FOUND!"=="0" (
    echo  Nanobot API 未在端口 8900 上运行
)

:: ============================================================
::  停止 Web 服务器 (端口 8080 / 8088)
:: ============================================================
echo.
echo [2/2] 检查 Web 服务器...

for %%P in (8080 8088) do (
    set "WEB_FOUND=0"
    for /f "usebackq tokens=2,5" %%a in (`netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"`) do (
        if "!WEB_FOUND!"=="0" (
            set "WEB_PID=%%b"
            set "WEB_FOUND=1"
            echo  找到进程 PID: %%b (端口 %%P)
            taskkill /PID %%b /F >nul 2>&1
            if !errorlevel! equ 0 (
                echo  [OK] Web 服务器 (端口 %%P) 已停止
                set /a STOPPED+=1
            ) else (
                echo  [警告] 无法停止 PID %%b
            )
        )
    )
    if "!WEB_FOUND!"=="0" (
        echo  端口 %%P 无进程运行
    )
)

:: ============================================================
::  结果汇总
:: ============================================================
echo.
echo  ╔══════════════════════════════════════════════════╗
if %STOPPED% gtr 0 (
echo  ║    已停止 %STOPPED% 个服务                        ║
) else (
echo  ║    没有发现需要停止的服务                       ║
)
echo  ╚══════════════════════════════════════════════════╝
echo.
echo  按任意键关闭此窗口...
pause >nul
