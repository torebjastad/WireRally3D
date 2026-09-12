#!/usr/bin/env python3
"""
Custom Zero-Cache Development Server for Årølia Rally 3D.
Forces browsers to NEVER cache HTML, JS, CSS, JSON, or media assets,
guaranteeing that every reload serves the latest version.
"""
import sys
import http.server
import socketserver
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
DIRECTORY = str(Path(__file__).resolve().parent.parent)

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Strict anti-caching headers across all browsers
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    # Override date-based conditional requests to prevent 304 Not Modified responses
    def do_GET(self):
        # Remove headers that could trigger 304 Not Modified
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        if 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']
        super().do_GET()

    def log_message(self, format, *args):
        # Suppress noisy logs, keep console clear
        pass

def main():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
        print(f"=======================================================")
        print(f"  ÅRØLIA RALLY 3D - NO-CACHE DEV SERVER")
        print(f"  URL: http://localhost:{PORT}")
        print(f"  Cache-Control: no-store, no-cache, must-revalidate")
        print(f"=======================================================")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == '__main__':
    main()
