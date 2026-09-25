import re
import yaml

'''
Convert between the frontend's flowgraph ({nodes, edges} in React Flow format)
and GNU Radio Companion .grc files (YAML, file_format 1).

Node data is {blockId, name, params, grcStates}, where params only holds values
that differ from the block defaults, so defaults are filled in from the block
definitions when saving. grcStates keeps GRC's per-block states (enabled/
disabled, rotation, ...) from a loaded file so they survive a save.
'''

ID_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


class FlowgraphError(ValueError):
    pass


def index_blocks(tree):
    """Flatten the category tree from grc_block_info.json into {block_id: definition}."""
    by_id = {}

    def walk(node):
        for key, value in node.items():
            if key == '_blocks':
                for b in value:
                    by_id.setdefault(b['id'], b)
            else:
                walk(value)

    walk(tree)
    return by_id


def _param_list(block_def):
    # Some blocks store parameters as {} instead of a list
    params = block_def.get('parameters')
    return params if isinstance(params, list) else []


def _block_parameters(block_def, values):
    """All parameters of a block as strings, defaults overridden by values."""
    params = {}
    for p in _param_list(block_def):
        default = p.get('default')
        if default is None:
            options = p.get('options') or ['']
            default = options[0]
        params[p['id']] = default

    # Parameters GRC adds to every block on top of the YAML definition
    params['comment'] = ''
    if block_def['id'] != 'options' and not block_def['id'].startswith('variable'):
        params['alias'] = ''
        params['affinity'] = ''
        if block_def.get('outputs'):
            params['minoutbuf'] = '0'
            params['maxoutbuf'] = '0'

    params.update(values or {})
    return {k: _to_str(v) for k, v in sorted(params.items())}


def _to_str(value):
    if isinstance(value, bool):
        return 'True' if value else 'False'
    return '' if value is None else str(value)


def _states(node):
    pos = node.get('position') or {}
    states = {
        'bus_sink': False,
        'bus_source': False,
        'bus_structure': None,
        'rotation': 0,
        'state': 'enabled',
    }
    states.update((node.get('data') or {}).get('grcStates') or {})
    states['coordinate'] = FlowList([round(pos.get('x', 0)), round(pos.get('y', 0))])
    return dict(sorted(states.items()))


def build_grc(flow, block_defs, grc_version):
    """Return (flowgraph_id, grc_dict) for a {nodes, edges} flowgraph."""
    nodes = flow.get('nodes') or []
    edges = flow.get('edges') or []

    options = None
    blocks = []
    names = {}  # node id -> instance name
    file_format = 1

    for node in nodes:
        data = node.get('data') or {}
        block_id = data.get('blockId')
        name = data.get('name', '')
        block_def = block_defs.get(block_id)
        if block_def is None:
            raise FlowgraphError(f'Unknown block type: {block_id}')
        if not ID_RE.match(name):
            raise FlowgraphError(f'Invalid ID "{name}" for {block_def["label"]}: use letters, digits and _')
        if name in names.values():
            raise FlowgraphError(f'Duplicate ID "{name}"')
        names[node['id']] = name
        file_format = max(file_format, int(block_def.get('file_format') or 1))

        params = _block_parameters(block_def, data.get('params'))
        if block_id == 'options':
            params['id'] = name
            options = {'parameters': dict(sorted(params.items())), 'states': _states(node)}
        else:
            blocks.append({'name': name, 'id': block_id, 'parameters': params, 'states': _states(node)})

    if options is None:
        raise FlowgraphError('Flowgraph has no Options block')

    connections = []
    for edge in edges:
        src, dst = names.get(edge.get('source')), names.get(edge.get('target'))
        if src is None or dst is None:
            raise FlowgraphError(f'Connection {edge.get("id")} refers to a missing block')
        connections.append(FlowList([src, str(edge.get('sourceHandle')), dst, str(edge.get('targetHandle'))]))

    return options['parameters']['id'], {
        'options': options,
        'blocks': blocks,
        'connections': connections,
        'metadata': {'file_format': file_format, 'grc_version': grc_version},
    }


def parse_grc(text):
    """
    Parse .grc YAML into {blocks, connections} for the frontend, where each
    block is {blockId, name, params, grcStates, position} and each connection
    is {source, sourcePort, target, targetPort} using block names.
    """
    try:
        grc = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise FlowgraphError(f'Not a valid .grc file: {e}')
    if not isinstance(grc, dict) or 'options' not in grc:
        raise FlowgraphError('Not a .grc file in the GNU Radio 3.8+ YAML format')

    def to_block(block_id, name, entry):
        params = {k: _to_str(v) for k, v in (entry.get('parameters') or {}).items()}
        states = dict(entry.get('states') or {})
        x, y = (states.pop('coordinate', None) or [0, 0])[:2]
        return {
            'blockId': block_id,
            'name': name,
            'params': params,
            'grcStates': states,
            'position': {'x': x, 'y': y},
        }

    options = grc['options'] or {}
    options_params = dict(options.get('parameters') or {})
    blocks = [to_block('options', _to_str(options_params.pop('id', 'default')),
                       {**options, 'parameters': options_params})]
    for entry in grc.get('blocks') or []:
        blocks.append(to_block(entry['id'], entry['name'], entry))

    connections = []
    for conn in grc.get('connections') or []:
        src, src_port, dst, dst_port = conn
        connections.append({'source': src, 'sourcePort': _to_str(src_port),
                            'target': dst, 'targetPort': _to_str(dst_port)})

    return {'blocks': blocks, 'connections': connections}


class FlowList(list):
    """List dumped in YAML flow style, e.g. [8, 8], like GRC does."""


class _Dumper(yaml.SafeDumper):
    pass


_Dumper.add_representer(FlowList, lambda d, v: d.represent_sequence('tag:yaml.org,2002:seq', v, flow_style=True))


def dump_grc(grc):
    """Serialize like GRC: one section per top-level key, separated by blank lines."""
    sections = [
        yaml.dump({key: value}, Dumper=_Dumper, sort_keys=False, default_flow_style=False, width=float('inf'))
        for key, value in grc.items()
    ]
    return '\n'.join(sections)
