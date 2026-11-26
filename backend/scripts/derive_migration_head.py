"""Print the single head revision from a directory of Alembic revisions."""
import argparse
import ast
from pathlib import Path
from typing import Dict, Iterable, List, Set


def _parents(node: ast.AST) -> List[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, (ast.List, ast.Tuple)):
        return [item.value for item in node.elts
                if isinstance(item, ast.Constant) and isinstance(item.value, str)]
    return []


def revision_graph(paths: Iterable[Path]) -> Dict[str, List[str]]:
    graph: Dict[str, List[str]] = {}
    for path in paths:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        revision = down = None
        for node in tree.body:
            if isinstance(node, ast.Assign):
                names = [target.id for target in node.targets if isinstance(target, ast.Name)]
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                names = [node.target.id]
            else:
                continue
            if "revision" in names:
                values = _parents(node.value)
                revision = values[0] if values else None
            elif "down_revision" in names:
                down = _parents(node.value)
        if revision:
            graph[revision] = down or []
    return graph


def find_head(graph: Dict[str, List[str]]) -> str:
    parents: Set[str] = {parent for values in graph.values() for parent in values}
    heads = sorted(set(graph) - parents)
    if len(heads) != 1:
        raise ValueError(f"expected one migration head, found {heads}")
    return heads[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=str(Path(__file__).resolve().parents[1] / "alembic" / "versions"))
    args = parser.parse_args()
    graph = revision_graph(Path(args.dir).glob("*.py"))
    print(find_head(graph))


if __name__ == "__main__":
    main()
