import ast
import glob
import builtins
import os

builtins_set = set(dir(builtins))

def check_scope(node, outer_scope, filepath):
    # Determine names defined in this scope
    current_scope = set(outer_scope)
    
    # If function, add parameters
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        for arg in node.args.args + node.args.kwonlyargs:
            current_scope.add(arg.arg)
        if node.args.vararg: current_scope.add(node.args.vararg.arg)
        if node.args.kwarg: current_scope.add(node.args.kwarg.arg)

    # Walk this node's direct statements to collect stores, imports, defs
    for child in ast.iter_child_nodes(node):
        if isinstance(child, ast.Import):
            for a in child.names:
                current_scope.add(a.asname or a.name.split('.')[0])
        elif isinstance(child, ast.ImportFrom):
            for a in child.names:
                current_scope.add(a.asname or a.name)
        elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            current_scope.add(child.name)
        elif isinstance(child, ast.Assign):
            for t in child.targets:
                for sub_t in ast.walk(t):
                    if isinstance(sub_t, ast.Name):
                        current_scope.add(sub_t.id)
        elif isinstance(child, ast.AugAssign):
            if isinstance(child.target, ast.Name):
                current_scope.add(child.target.id)
        elif isinstance(child, (ast.For, ast.AsyncFor)):
            for sub_t in ast.walk(child.target):
                if isinstance(sub_t, ast.Name):
                    current_scope.add(sub_t.id)
        elif isinstance(child, ast.With):
            for item in child.items:
                if item.optional_vars:
                    for sub_t in ast.walk(item.optional_vars):
                        if isinstance(sub_t, ast.Name):
                            current_scope.add(sub_t.id)
        elif isinstance(child, ast.Try):
            for handler in child.handlers:
                if handler.name:
                    current_scope.add(handler.name)

    # Now check child nodes
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            check_scope(child, current_scope, filepath)
        elif isinstance(child, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            comp_scope = set(current_scope)
            for gen in child.generators:
                for sub_t in ast.walk(gen.target):
                    if isinstance(sub_t, ast.Name):
                        comp_scope.add(sub_t.id)
            for sub in ast.walk(child):
                if isinstance(sub, ast.Name) and isinstance(sub.ctx, ast.Load):
                    if sub.id not in comp_scope:
                        print(f"REAL BUG: '{sub.id}' undefined in comp in {filepath}:{sub.lineno}")
        elif isinstance(child, ast.Lambda):
            lam_scope = set(current_scope)
            for arg in child.args.args:
                lam_scope.add(arg.arg)
            for sub in ast.walk(child.body):
                if isinstance(sub, ast.Name) and isinstance(sub.ctx, ast.Load):
                    if sub.id not in lam_scope:
                        print(f"REAL BUG: '{sub.id}' undefined in lambda in {filepath}:{sub.lineno}")
        else:
            # Check for loads inside non-nested compound statements
            for sub in ast.walk(child):
                # Don't descend into nested functions/lambdas/comps here
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp, ast.Lambda)):
                    continue
                if isinstance(sub, ast.Name) and isinstance(sub.ctx, ast.Load):
                    if sub.id not in current_scope:
                        print(f"REAL BUG: '{sub.id}' undefined in {filepath}:{sub.lineno}")

for fpath in glob.glob('app/**/*.py', recursive=True):
    with open(fpath, 'r', encoding='utf-8') as f:
        code = f.read()
    try:
        tree = ast.parse(code, fpath)
    except Exception as e:
        print(f"PARSE ERROR: {fpath} {e}")
        continue

    initial_scope = set(builtins_set)
    initial_scope.add('__file__')
    initial_scope.add('__name__')
    initial_scope.add('__doc__')
    check_scope(tree, initial_scope, fpath)

print("Scan complete.")
