"""
东莞首靠船识别助手 · Web 服务器（含 Nanobot API 代理）
------------------------------------------------------
功能：
  1. 提供静态文件服务（HTML/CSS/JS/图片等）
  2. 将 /v1/* 请求代理到 Nanobot API (127.0.0.1:8900)
  3. 解决 CORS 跨域问题

用法：
  python server.py
  python server.py --port 8080

访问：
  http://localhost:8080/login.html
"""
import http.server
import socketserver
import urllib.request
import urllib.error
import sys
import os
import json
import threading

PORT = 8080
NANOBOT_API = "http://127.0.0.1:8900"
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    """静态文件 + API 代理"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PROJECT_DIR, **kwargs)

    def do_OPTIONS(self):
        """处理 CORS 预检请求"""
        if self.path.startswith("/v1/") or self.path == "/health":
            self.send_response(200)
            self._send_cors_headers()
            self.end_headers()
        else:
            # 非 API 路径的 OPTIONS 请求返回 405（静态文件不支持 OPTIONS）
            self.send_response(405)
            self.send_header("Allow", "GET, POST, HEAD")
            self.end_headers()

    def do_GET(self):
        """GET 请求：静态文件 或 API 代理"""
        if self.path.startswith("/v1/") or self.path == "/health":
            self._proxy_to_nanobot("GET")
        else:
            super().do_GET()

    def do_POST(self):
        """POST 请求：代理到 Nanobot API"""
        if self.path.startswith("/v1/"):
            self._proxy_to_nanobot("POST")
        else:
            self.send_error(404, "Not Found")

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")

    def _proxy_to_nanobot(self, method):
        """将请求代理转发到 Nanobot API"""
        target_url = NANOBOT_API + self.path

        # 读取请求体
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None
        
        # 调试日志：打印请求信息
        print(f"\n[DEBUG] 代理请求: {method} {self.path}")
        if body:
            try:
                body_str = body.decode('utf-8') if isinstance(body, bytes) else str(body)
                print(f"[DEBUG] 请求体: {body_str[:200]}...")
            except:
                pass

        # 构建代理请求
        headers = {"Content-Type": "application/json"}
        if self.headers.get("Authorization"):
            headers["Authorization"] = self.headers["Authorization"]

        try:
            req = urllib.request.Request(
                target_url, data=body, headers=headers, method=method
            )
            resp = urllib.request.urlopen(req, timeout=120)

            # 检查是否是流式响应
            content_type = resp.headers.get("Content-Type", "")
            is_stream = "text/event-stream" in content_type or (
                body and b'"stream":true' in body or body and b'"stream": true' in body
            )

            if is_stream:
                # 流式响应：逐块转发
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self._send_cors_headers()
                self.end_headers()

                try:
                    while True:
                        chunk = resp.read(1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    pass
            else:
                # 普通响应
                response_body = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", content_type or "application/json")
                self.send_header("Content-Length", str(len(response_body)))
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(response_body)

        except urllib.error.HTTPError as e:
            error_body = e.read()
            # 调试日志：打印错误响应
            try:
                error_str = error_body.decode('utf-8') if isinstance(error_body, bytes) else str(error_body)
                print(f"[DEBUG] 错误响应 {e.code}: {error_str[:300]}")
            except:
                print(f"[DEBUG] 错误响应 {e.code}: {e.reason}")
            
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(error_body)

        except urllib.error.URLError as e:
            error_msg = json.dumps({
                "error": {
                    "message": f"无法连接 Nanobot API ({NANOBOT_API}): {e.reason}",
                    "type": "connection_error",
                    "hint": "请确认已运行 nanobot serve"
                }
            }, ensure_ascii=False).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(error_msg)

        except Exception as e:
            error_msg = json.dumps({
                "error": {"message": str(e), "type": "proxy_error"}
            }, ensure_ascii=False).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(error_msg)

    def log_message(self, format, *args):
        """美化日志输出"""
        path = args[0].split(" ")[1] if args else ""
        if "/v1/" in path or path == "/health":
            prefix = "⚡ API"
        else:
            prefix = "📄 FILE"
        sys.stderr.write(f"  {prefix}  {args[0]}\n")


class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    global PORT
    # 支持命令行指定端口
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            PORT = int(sys.argv[idx + 1])

    os.chdir(PROJECT_DIR)

    print()
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║    东莞首靠船识别助手 · Web 服务器               ║")
    print("  ╠══════════════════════════════════════════════════╣")
    print(f"  ║    前端地址:  http://localhost:{PORT}              ║")
    print(f"  ║    API 代理:  /v1/* → {NANOBOT_API}/v1/*    ║")
    print("  ║    按 Ctrl+C 停止                                ║")
    print("  ╚══════════════════════════════════════════════════╝")
    print()
    print(f"  入口页面:")
    print(f"    · 登录:    http://localhost:{PORT}/login.html")
    print(f"    · 指挥台:  http://localhost:{PORT}/index.html")
    print(f"    · 大屏:    http://localhost:{PORT}/daily-dashboard.html")
    print()

    try:
        with ThreadedHTTPServer(("", PORT), ProxyHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  服务已停止")
    except OSError as e:
        if "Address already in use" in str(e) or "10048" in str(e):
            print(f"\n  [错误] 端口 {PORT} 已被占用，尝试 {PORT + 8}...")
            PORT += 8
            with ThreadedHTTPServer(("", PORT), ProxyHandler) as httpd:
                print(f"  使用备用端口: http://localhost:{PORT}")
                httpd.serve_forever()
        else:
            raise


if __name__ == "__main__":
    main()
