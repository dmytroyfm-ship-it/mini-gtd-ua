#!/usr/bin/env python3
"""Локальний статичний сервер для Mini GTD UA.

На відміну від `python -m http.server`, для шляхів без відповідного
файлу на диску (наприклад /list/next) віддає index.html — це
потрібно клієнтському роутеру (js/router.js), який сам визначає,
яку сторінку показати. Без стороннiх бібліотек, лише stdlib.
"""

import http.server
import os
import socketserver

PORT = 4173
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class SpaFallbackHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        requested_path = self.path.split("?")[0]
        local_path = self.translate_path(requested_path)
        has_extension = bool(os.path.splitext(requested_path)[1])

        if not has_extension and not os.path.isfile(local_path):
            self.path = "/index.html"

        return super().do_GET()


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), SpaFallbackHandler) as httpd:
        print(f"Mini GTD UA: http://localhost:{PORT}")
        httpd.serve_forever()
