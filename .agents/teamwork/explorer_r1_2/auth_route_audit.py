import sys
import os

sys.path.insert(0, os.path.abspath('.'))

from app import create_app

app = create_app()

routes_info = []

for rule in app.url_map.iter_rules():
    func = app.view_functions[rule.endpoint]
    methods = [m for m in rule.methods if m not in ('HEAD', 'OPTIONS')]

    # Check docstring or attributes or closure
    has_jwt = False
    # Check if jwt_required is wrapped
    closure = getattr(func, '__closure__', None)
    func_code = getattr(func, '__code__', None)
    func_name = func.__name__

    # Look for jwt in closure or code
    closure_vars = []
    if closure:
        for cell in closure:
            try:
                val = cell.cell_contents
                closure_vars.append(str(val))
                if 'jwt_required' in str(val) or 'verify_jwt_in_request' in str(val):
                    has_jwt = True
            except ValueError:
                pass

    routes_info.append({
        'rule': rule.rule,
        'endpoint': rule.endpoint,
        'methods': methods,
        'func_name': func_name,
        'has_jwt': has_jwt,
    })

print(f"Total registered routes: {len(routes_info)}")
print("\n" + "=" * 90)
print(f"{'RULE':<45} | {'METHODS':<15} | {'ENDPOINT':<25}")
print("=" * 90)
for r in sorted(routes_info, key=lambda x: x['rule']):
    print(f"{r['rule']:<45} | {','.join(r['methods']):<15} | {r['endpoint']:<25}")
