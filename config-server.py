"""
东莞首靠船识别助手 · Nanobot 配置管理服务
------------------------------------------
功能：
  1. POST /api/config   — 接收 config.json 并写入 ~/.nanobot/config.json
  2. GET  /api/config   — 读取当前配置（脱敏 API Key）
  3. POST /api/restart  — 重启 Nanobot systemd 服务
  4. GET  /health       — 健康检查

仅监听 127.0.0.1（通过 Nginx 反向代理暴露，不直接对外）

用法：
  python config-server.py
  python config-server.py --port 8901
"""
import http.server
import json
import os
import sys
import subprocess
import platform

PORT = 8901
HOST = "127.0.0.1"

# 跨平台配置路径
if platform.system() == "Windows":
    NANOBOT_HOME = os.path.join(os.environ.get("USERPROFILE", os.path.expanduser("~")), ".nanobot")
else:
    NANOBOT_HOME = os.path.join(os.path.expanduser("~"), ".nanobot")

CONFIG_PATH = os.path.join(NANOBOT_HOME, "config.json")


def mask_key(key: str) -> str:
    """脱敏 API Key：只显示前6位和后4位"""
    if not key or len(key) <= 12:
        return "****"
    return key[:6] + "****" + key[-4:]


class ConfigHandler(http.server.BaseHTTPRequestHandler):

    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _json_response(self, data, status=200):
        self._set_headers(status)
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        if self.path == "/health":
            self._json_response({"status": "ok", "service": "config-server"})
            return

        if self.path == "/api/config":
            if os.path.exists(CONFIG_PATH):
                try:
                    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                    # 脱敏 API Key
                    for pname, pconf in cfg.get("providers", {}).items():
                        if isinstance(pconf, dict) and "apiKey" in pconf and pconf["apiKey"]:
                            pconf["apiKey"] = mask_key(pconf["apiKey"])
                    self._json_response({"ok": True, "config": cfg, "path": CONFIG_PATH})
                except Exception as e:
                    self._json_response({"ok": False, "error": str(e)}, 500)
            else:
                self._json_response({"ok": False, "error": "配置文件不存在", "path": CONFIG_PATH}, 404)
            return

        self._json_response({"error": "Not Found"}, 404)

    def do_POST(self):
        if self.path == "/api/config":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                config = json.loads(body.decode("utf-8"))

                # 验证基本结构
                if "providers" not in config and "agents" not in config:
                    self._json_response({"ok": False, "error": "配置格式错误：缺少 providers 或 agents 字段"}, 400)
                    return

                # 确保目录存在
                os.makedirs(NANOBOT_HOME, exist_ok=True)

                # 写入配置
                with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                    json.dump(config, f, ensure_ascii=False, indent=2)

                self._json_response({
                    "ok": True,
                    "message": f"配置已写入 {CONFIG_PATH}",
                    "path": CONFIG_PATH,
                })
                print(f"  [✓] 配置已写入: {CONFIG_PATH}")

            except json.JSONDecodeError as e:
                self._json_response({"ok": False, "error": f"JSON 解析失败: {e}"}, 400)
            except Exception as e:
                self._json_response({"ok": False, "error": str(e)}, 500)
            return

        if self.path == "/api/restart":
            try:
                system = platform.system()
                if system == "Windows":
                    # Windows 下不自动重启，提示用户手动操作
                    self._json_response({
                        "ok": True,
                        "message": "Windows 环境下请手动重启 Nanobot：关闭旧窗口后重新运行 nanobot serve",
                        "platform": "windows",
                    })
                else:
                    # Linux: systemctl restart nanobot
                    result = subprocess.run(
                        ["systemctl", "restart", "nanobot"],
                        capture_output=True, text=True, timeout=15
                    )
                    if result.returncode == 0:
                        self._json_response({
                            "ok": True,
                            "message": "Nanobot 服务已重启",
                            "platform": "linux",
                        })
                        print("  [✓] Nanobot 服务已重启")
                    else:
                        self._json_response({
                            "ok": False,
                            "error": f"重启失败: {result.stderr}",
                        }, 500)
            except Exception as e:
                self._json_response({"ok": False, "error": str(e)}, 500)
            return

        self._json_response({"error": "Not Found"}, 404)

    def log_message(self, format, *args):
        print(f"  [{self.log_date_time_string()}] {format % args}")


def main():
    global PORT
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            PORT = int(sys.argv[idx + 1])

    print()
    print(f"  ╔══════════════════════════════════════════════╗")
    print(f"  ║  Nanobot 配置管理服务                         ║")
    print(f"  ║  监听: http://{HOST}:{PORT}                ║")
    print(f"  ║  配置路径: {CONFIG_PATH}")
    print(f"  ╚══════════════════════════════════════════════╝")
    print()

    server = http.server.HTTPServer((HOST, PORT), ConfigHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  配置管理服务已停止")
        server.server_close()


if __name__ == "__main__":
    main()
