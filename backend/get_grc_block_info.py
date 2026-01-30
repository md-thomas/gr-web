import yaml
from pathlib import Path

def parse_tree_node(node):
    """
    Recursively parse a GRC tree node.
    """
    result = {}
    blocks = []

    for item in node:
        # Block ID
        if isinstance(item, str):
            blocks.append(item)

        # Subcategory
        elif isinstance(item, dict):
            for name, contents in item.items():
                result[name] = parse_tree_node(contents)

    if blocks:
        result["blocks"] = blocks

    return result


def parse_tree_file(path):
    with open(path, "r") as f:
        data = yaml.safe_load(f)

    tree = {}

    for root_name, contents in data.items():
        tree[root_name] = parse_tree_node(contents)

    return tree

def parse_all_tree_files(tree_dir="/usr/share/gnuradio/grc/blocks"):
    merged = {}

    for path in Path(tree_dir).glob("*.tree.yml"):
        tree = parse_tree_file(path)

        for root, content in tree.items():
            merged.setdefault(root, {})
            merged[root].update(content)

    return merged

def attach_block_metadata(tree, block_defs):
    def recurse(node):
        if isinstance(node, dict):
            for key, value in node.items():
                recurse(value)

        elif isinstance(node, list):
            enriched = []
            for item in node:
                if isinstance(item, str) and item in block_defs:
                    enriched.append(block_defs[item])
                else:
                    recurse(item)
                    enriched.append(item)

            node.clear()
            node.extend(enriched)

    recurse(tree)
    return tree

def parse_block_file(path):
    with open(path, "r") as f:
        data = yaml.safe_load(f)

    block_id = data.get("id")
    if not block_id:
        return None

    return {
        "id": block_id,
        "label": data.get("label", block_id),
        "category": data.get("category", ""),
        "parameters": data.get("parameters", {}),
        "inputs": data.get("inputs", []),
        "outputs": data.get("outputs", []),
        "flags": data.get("flags", {}),
        "raw": data,  # keep full definition if needed
    }


def load_all_block_defs(block_dir="/usr/share/gnuradio/grc/blocks"):
    block_defs = {}

    for path in Path(block_dir).glob("*.block.yml"):
        block = parse_block_file(path)
        if block:
            block_defs[block["id"]] = block

    return block_defs
