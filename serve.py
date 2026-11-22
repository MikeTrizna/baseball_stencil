#!/usr/bin/env python3
"""Simple zero-dependency local web server for the Baseball Stitch Stencil Designer."""

from __future__ import annotations

import argparse
import functools
import http.server
import mimetypes
import os
import sys
import webbrowser
from pathlib import Path


class StencilRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Static file handler with explicit MIME types and no-cache headers for local dev."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".svg": "image/svg+xml",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        sys.stdout.write(f"[stencil-server] {self.address_string()} - {format % args}\n")
        sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve Baseball Stitch Stencil Designer locally.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--open", action="store_true", help="Open the app automatically in the default browser")
    args = parser.parse_args()

    root_dir = Path(__file__).resolve().parent
    handler = functools.partial(StencilRequestHandler, directory=str(root_dir))
    server = http.server.ThreadingHTTPServer((args.host, args.port), handler)

    url = f"http://{args.host}:{args.port}"
    print(f"\n  Baseball Stitch Stencil Designer")
    print(f"  Serving: {root_dir}")
    print(f"  Open in your browser: {url}\n")
    print("  Press Ctrl+C to stop the server.\n", flush=True)

    if args.open:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
