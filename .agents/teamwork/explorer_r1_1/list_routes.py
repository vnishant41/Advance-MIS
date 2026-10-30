import os
import sys

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, base_dir)

from app import create_app

app = create_app()

routes = []
for r in app.url_map.iter_rules():
    methods = sorted(list(r.methods - {'HEAD', 'OPTIONS'}))
    routes.append({
        'rule': r.rule,
        'endpoint': r.endpoint,
        'methods': ', '.join(methods)
    })

routes.sort(key=lambda x: x['rule'])

print(f"TOTAL ROUTES: {len(routes)}")
for r in routes:
    print(f"{r['rule']:<50} {r['methods']:<20} {r['endpoint']}")
