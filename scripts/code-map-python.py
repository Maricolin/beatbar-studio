"""Emit a static Python symbol inventory for build-code-map.mjs; no app imports."""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def inspect(path: Path) -> dict:
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    symbols = []
    routes = []
    imports = []
    for node in tree.body:
        if isinstance(node, ast.Import):
            imports.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.append("." * node.level + (node.module or ""))

    def visit(node: ast.AST, scope: tuple[str, ...] = ()) -> None:
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            name = ".".join((*scope, node.name))
            kind = "类" if isinstance(node, ast.ClassDef) else "异步函数" if isinstance(node, ast.AsyncFunctionDef) else "函数"
            if isinstance(node, ast.ClassDef):
                signature = node.name + "(" + ", ".join(ast.unparse(base) for base in node.bases) + ")"
            else:
                signature = ("async " if isinstance(node, ast.AsyncFunctionDef) else "") + node.name + "(" + ast.unparse(node.args) + ")"
                if node.returns:
                    signature += " -> " + ast.unparse(node.returns)
                for decorator in node.decorator_list:
                    if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute) and decorator.func.attr in {"get", "post", "put", "patch", "delete"} and decorator.args and isinstance(decorator.args[0], ast.Constant):
                        routes.append({"method": decorator.func.attr.upper(), "path": decorator.args[0].value, "handler": name, "line": node.lineno})
            doc = (ast.get_docstring(node) or "").splitlines()
            symbols.append({"kind": kind, "name": name, "signature": signature, "line": node.lineno, "doc": doc[0] if doc else ""})
            scope = (*scope, node.name)
        for child in ast.iter_child_nodes(node):
            visit(child, scope)

    visit(tree)
    return {"file": path.relative_to(ROOT).as_posix(), "imports": sorted(set(imports)), "symbols": symbols, "routes": routes}


def main() -> None:
    paths = list(ROOT.glob("*.py")) + list((ROOT / "backend").rglob("*.py")) + list((ROOT / "scripts").glob("*.py"))
    paths = sorted((path for path in paths if "__pycache__" not in path.parts), key=lambda path: path.relative_to(ROOT).as_posix())
    print(json.dumps([inspect(path) for path in paths], ensure_ascii=False))


if __name__ == "__main__":
    main()
