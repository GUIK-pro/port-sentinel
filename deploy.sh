#!/bin/bash
# ============================================================
#  港哨 · 首靠船风险识别系统 — 宝塔部署脚本
#  适用于: Ubuntu 20.04+ / CentOS 7+ (阿里云宝塔面板)
#
#  用法:
#    chmod +x deploy.sh
#    sudo ./deploy.sh
#
#  部署后访问: http://8.138.20.171/login.html
# ============================================================

set -e

PROJECT_DIR="/www/wwwroot/port-sentinel"
NANOBOT_PORT=8900
PYTHON_MIN="3.11"

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║    港哨 · 首靠船风险识别系统 — 一键部署          ║"
echo "  ║    目标: http://8.138.20.171                     ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# ============================================================
#  Step 1: 检查运行权限
# ============================================================
echo "[1/7] 检查权限..."
if [ "$(id -u)" -ne 0 ]; then
    echo "  [错误] 请用 sudo 运行此脚本"
    exit 1
fi
echo "  ✓ root 权限确认"

# ============================================================
#  Step 2: 安装系统依赖
# ============================================================
echo "[2/7] 安装系统依赖..."
if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq python3 python3-pip python3-venv git curl
elif command -v yum &>/dev/null; then
    yum install -y -q python3 python3-pip git curl
else
    echo "  [警告] 未识别的包管理器，请确保已安装 Python 3.11+"
fi
echo "  ✓ 系统依赖安装完成"

# 检查 Python 版本
if ! command -v python3 &>/dev/null; then
    echo "  [错误] 未找到 Python3，请在宝塔面板 → 软件商店 中安装 Python 3.11+"
    exit 1
fi
PY_VER=$(python3 --version 2>&1 | awk '{print $2}')
echo "  Python 版本: $PY_VER"

# ============================================================
#  Step 3: 克隆/更新项目代码
# ============================================================
echo "[3/7] 部署项目代码..."
if [ -d "$PROJECT_DIR/.git" ]; then
    echo "  项目已存在，执行 git pull 更新..."
    cd "$PROJECT_DIR"
    git pull origin master
else
    echo "  克隆项目到 $PROJECT_DIR ..."
    mkdir -p "$(dirname $PROJECT_DIR)"
    git clone https://github.com/GUIK-pro/port-sentinel.git "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi
echo "  ✓ 代码部署完成"

# ============================================================
#  Step 4: 安装 Nanobot AI
# ============================================================
echo "[4/7] 安装 Nanobot AI..."
if python3 -c "import nanobot" 2>/dev/null; then
    echo "  Nanobot 已安装，跳过"
else
    pip3 install "nanobot-ai[api]" --quiet
    echo "  ✓ Nanobot 安装完成"
fi

# 初始化配置（如果不存在）
NANOBOT_HOME="$HOME/.nanobot"
if [ ! -f "$NANOBOT_HOME/config.json" ]; then
    echo "  [重要] Nanobot 配置文件不存在！"
    echo "  请在部署后手动配置: $NANOBOT_HOME/config.json"
    echo "  或通过浏览器访问: http://8.138.20.171/nanobot-config.html"
    mkdir -p "$NANOBOT_HOME"
fi

# ============================================================
#  Step 5: 创建 Nanobot 系统服务（开机自启）
# ============================================================
echo "[5/7] 创建系统服务..."
cat > /etc/systemd/system/nanobot.service << 'EOF'
[Unit]
Description=Nanobot AI API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/www/wwwroot/port-sentinel
ExecStart=/usr/local/bin/nanobot serve --host 127.0.0.1 --port 8900
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# 查找 nanobot 实际路径
NANOBOT_BIN=$(which nanobot 2>/dev/null || echo "/usr/local/bin/nanobot")
sed -i "s|ExecStart=.*|ExecStart=$NANOBOT_BIN serve --host 127.0.0.1 --port 8900|" /etc/systemd/system/nanobot.service

systemctl daemon-reload
systemctl enable nanobot.service
systemctl start nanobot.service
echo "  ✓ Nanobot 服务已启动（开机自启）"

# 创建配置管理服务
PYTHON_BIN=$(which python3 2>/dev/null || which python 2>/dev/null || echo "/usr/bin/python3")
cat > /etc/systemd/system/nanobot-config.service << EOF
[Unit]
Description=Nanobot Config Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/www/wwwroot/port-sentinel
ExecStart=$PYTHON_BIN config-server.py --port 8901
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nanobot-config.service
systemctl start nanobot-config.service
echo "  ✓ 配置管理服务已启动（端口 8901）"

# 等待 Nanobot 就绪
echo "  等待 Nanobot 就绪..."
for i in $(seq 1 20); do
    if curl -s http://127.0.0.1:$NANOBOT_PORT/health >/dev/null 2>&1; then
        echo "  ✓ Nanobot API 已就绪！"
        break
    fi
    sleep 1
done

# ============================================================
#  Step 6: 配置 Nginx（宝塔兼容）
# ============================================================
echo "[6/7] 配置 Nginx..."

# 宝塔 Nginx 配置目录
BT_NGINX_DIR="/www/server/panel/vhost/nginx"
SYS_NGINX_DIR="/etc/nginx/sites-enabled"

# 复制配置文件
if [ -d "$BT_NGINX_DIR" ]; then
    cp "$PROJECT_DIR/nginx.conf" "$BT_NGINX_DIR/8.138.20.171.conf"
    echo "  ✓ 已部署到宝塔 Nginx 配置目录"
elif [ -d "$SYS_NGINX_DIR" ]; then
    cp "$PROJECT_DIR/nginx.conf" "$SYS_NGINX_DIR/port-sentinel.conf"
    echo "  ✓ 已部署到系统 Nginx 配置目录"
else
    # 尝试找宝塔 nginx 主配置
    NGINX_CONF=$(find /www/server -name "nginx.conf" -type f 2>/dev/null | head -1)
    if [ -n "$NGINX_CONF" ]; then
        NGINX_DIR=$(dirname "$NGINX_CONF")
        cp "$PROJECT_DIR/nginx.conf" "$NGINX_DIR/conf.d/port-sentinel.conf" 2>/dev/null || \
            echo "  [警告] 请手动将 nginx.conf 内容添加到 Nginx 配置中"
    fi
fi

# 重载 Nginx
if command -v nginx &>/dev/null; then
    nginx -t 2>&1 && systemctl reload nginx || echo "  [警告] Nginx 配置有误，请手动检查"
    echo "  ✓ Nginx 已重载"
elif [ -x "/etc/init.d/nginx" ]; then
    /etc/init.d/nginx reload 2>/dev/null && echo "  ✓ Nginx 已重载"
fi

# ============================================================
#  Step 7: 设置文件权限
# ============================================================
echo "[7/7] 设置文件权限..."
chown -R www:www "$PROJECT_DIR" 2>/dev/null || chown -R nginx:nginx "$PROJECT_DIR" 2>/dev/null || true
chmod -R 755 "$PROJECT_DIR"
echo "  ✓ 权限设置完成"

# ============================================================
#  完成
# ============================================================
echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║    部署完成！                                    ║"
echo "  ╠══════════════════════════════════════════════════╣"
echo "  ║                                                  ║"
echo "  ║    访问地址:  http://8.138.20.171                ║"
echo "  ║    登录页:    http://8.138.20.171/login.html     ║"
echo "  ║    指挥台:    http://8.138.20.171/index.html     ║"
echo "  ║    大屏看板:  http://8.138.20.171/daily-dashboard.html  ║"
echo "  ║                                                  ║"
echo "  ║    默认账号: admin / admin                       ║"
echo "  ║                                                  ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
echo "  常用管理命令:"
echo "    systemctl status  nanobot     # 查看 Nanobot 状态"
echo "    systemctl restart nanobot     # 重启 Nanobot"
echo "    systemctl stop    nanobot     # 停止 Nanobot"
echo "    journalctl -u nanobot -f      # 查看 Nanobot 日志"
echo ""
echo "  如果 AI 对话功能不可用，请配置 LLM API Key:"
echo "    编辑: $HOME/.nanobot/config.json"
echo "    或浏览器访问: http://8.138.20.171/nanobot-config.html"
echo ""
