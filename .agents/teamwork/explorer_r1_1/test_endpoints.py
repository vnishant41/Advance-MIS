import urllib.request
import urllib.error
import json

base_url = "http://127.0.0.1:5000"

endpoints_to_test = [
    ("/", "GET"),
    ("/favicon.ico", "GET"),
    ("/api/auth/me", "GET"),
    ("/api/crishi/grid", "GET"),
    ("/api/crishi/reports/all", "GET"),
    ("/api/crishi/roster/scrapper-matrix", "GET"),
    ("/api/dash/stats", "GET"),
    ("/api/dash/alerts", "GET"),
    ("/api/admin/users", "GET"),
    ("/api/admin/reports", "GET"),
    ("/api/admin/commodities", "GET"),
    ("/api/admin/table-mappings", "GET"),
    ("/api/mis/reports", "GET"),
    ("/api/mis/templates", "GET"),
    ("/api/kanban/board", "GET"),
    ("/api/chat/channels", "GET"),
    ("/api/roster/today", "GET"),
    ("/api/roster/scrapper-matrix", "GET"),
    ("/api/notifications/", "GET"),
]

print(f"{'Endpoint':<40} {'Status':<8} {'Size / Response Summary'}")
print("-" * 75)

for ep, method in endpoints_to_test:
    url = f"{base_url}{ep}"
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read()
            status = resp.status
            content_type = resp.headers.get("Content-Type", "")
            if "application/json" in content_type:
                try:
                    data = json.loads(body.decode("utf-8"))
                    summary = f"JSON: keys={list(data.keys())[:4]} (bytes={len(body)})"
                except Exception:
                    summary = f"JSON parse error (bytes={len(body)})"
            else:
                summary = f"HTML/text (bytes={len(body)})"
            print(f"{ep:<40} {status:<8} {summary}")
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f"{ep:<40} {e.code:<8} HTTPError: {e.reason} (bytes={len(body)})")
    except Exception as e:
        print(f"{ep:<40} {'ERR':<8} {str(e)}")
