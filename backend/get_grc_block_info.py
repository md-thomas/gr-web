import os
import yaml
import json

'''
Create the block info json file like this: 
    python get_grc_block_info.py > grc_block_info.json
'''

def get_full_gr_tree(block_path='/usr/share/gnuradio/grc/blocks'):
    block_registry = {}

    # 1. Parse Block YAMLs with Flag Filtering
    for filename in os.listdir(block_path):
        if filename.endswith('.block.yml'):
            try:
                with open(os.path.join(block_path, filename), 'r') as f:
                    data = yaml.safe_load(f)
                    if not data or 'id' not in data: continue
                    
                    # FLAG FILTERING
                    flags = data.get('flags', [])
                    if isinstance(flags, list) and 'hide' in flags:
                        continue
                    
                    b_id = data['id']
                    # Use replace for precise bracket removal
                    raw_cat = data.get('category', 'Misc')
                    clean_cat = raw_cat.replace('[', '').replace(']', '')
                    
                    block_registry[b_id] = {
                        'id': b_id,
                        'label': data.get('label', b_id),
                        'category': clean_cat,
                        "parameters": data.get("parameters", {}),
                        "inputs": data.get("inputs", []),
                        "outputs": data.get("outputs", []),
                        "asserts": data.get("asserts", []),
                        "templates": data.get("templates", []),
                        "cpp_templates": data.get("cpp_templates", []),
                        "documentation": data.get("documentation", None),
                        "file_format": data.get("file_format", None),
                        "flags": data.get("flags", {}),
                        "file": filename,
                    }
            except: continue

    # 2. Build the nested dictionary structure
    final_skeleton = {}

    def insert_into_dict(path, block_data):
        # Ensure path is clean of brackets before splitting
        clean_p = path.replace('[', '').replace(']', '')
        parts = [p.strip() for p in clean_p.split('/') if p]
        
        curr = final_skeleton
        for i, part in enumerate(parts):
            if part not in curr:
                curr[part] = {'_blocks': []}
            
            if i == len(parts) - 1:
                if not any(b['id'] == block_data['id'] for b in curr[part]['_blocks']):
                    curr[part]['_blocks'].append(block_data)
            
            # Move deeper into the tree
            # Ensure we don't accidentally overwrite a limb dict with something else
            if not isinstance(curr[part], dict):
                curr[part] = {'_blocks': []}
                
            curr = curr[part]

    # 3. Parse Tree YAMLs (The Hierarchy Overrides)
    overridden_ids = set()

    def process_tree_entry(current_path, entry):
        """
        Recursively walks through tree.yml entries.
        entry can be: a list of IDs, a single ID string, or a nested dict.
        """
        if isinstance(entry, list):
            for item in entry:
                process_tree_entry(current_path, item)
        elif isinstance(entry, dict):
            for sub_path, sub_entry in entry.items():
                # Join the path (e.g., 'Core' + 'Type Converters')
                new_path = f"{current_path}/{sub_path}"
                process_tree_entry(new_path, sub_entry)
        elif isinstance(entry, str):
            # This is an actual Block ID
            if entry in block_registry:
                insert_into_dict(current_path, block_registry[entry])
                overridden_ids.add(entry)

    # Now run the updated parser
    tree_files = [f for f in os.listdir(block_path) if f.endswith('.tree.yml')]
    for filename in tree_files:
        try:
            with open(os.path.join(block_path, filename), 'r') as f:
                data = yaml.safe_load(f)
                if not data: continue
                # The top level of tree.yml is always a dict of paths
                for path_str, content in data.items():
                    process_tree_entry(path_str, content)
        except Exception as e:
            print(f"Error in {filename}: {e}")

    # 4. Add remaining blocks via default categories
    for b_id, meta in block_registry.items():
        if b_id not in overridden_ids:
            insert_into_dict(meta['category'], meta)

    # 5. Recursive Sort
    def sort_recursive(node):
        if isinstance(node, dict):
            sorted_node = {}
            for k in sorted(node.keys()):
                if k == '_blocks':
                    if node[k]:
                        sorted_node[k] = sorted(node[k], key=lambda x: x['label'].lower())
                else:
                    res = sort_recursive(node[k])
                    if res:
                        sorted_node[k] = res
            return sorted_node
        return node

    return sort_recursive(final_skeleton)

def get_block_info():
    tree = get_full_gr_tree()
    return tree

if __name__ == "__main__":
    full_tree = get_full_gr_tree()
    print(json.dumps(full_tree, indent=4))