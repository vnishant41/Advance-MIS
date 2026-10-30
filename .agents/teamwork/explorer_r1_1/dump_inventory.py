import os
import sys
import json

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, base_dir)

from app import create_app

app = create_app()

by_blueprint = {}
for r in app.url_map.iter_rules():
    endpoint = r.endpoint
    bp = endpoint.split('.')[0] if '.' in endpoint else 'core'
    methods = sorted(list(r.methods - {'HEAD', 'OPTIONS'}))
    if bp not in by_blueprint:
        by_blueprint[bp] = []
    by_blueprint[bp].append({
        'rule': r.rule,
        'endpoint': endpoint,
        'methods': methods
    })

for bp in by_blueprint:
    by_blueprint[bp].sort(key=lambda x: x['rule'])

output_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'route_inventory.json')
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(by_blueprint, f, indent=2)

print(f"Exported {sum(len(v) for v in by_blueprint.values())} routes across {len(by_blueprint)} blueprints to route_inventory.json")
for bp, items in sorted(by_blueprint.items()):
    print(f"Blueprint: {bp:<15} ({len(items)} routes)")
