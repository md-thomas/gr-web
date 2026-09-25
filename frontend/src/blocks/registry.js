// Maps GRC block ids to React Flow node components. Every block renders with
// GenericBlockNode unless it has an entry in blockOverrides.
import GenericBlockNode from "../components/GenericBlockNode";
import OptionsNode from "../components/OptionsNode";
import VariableNode from "../components/VariableNode";

// block id -> custom component
export const blockOverrides = {
  options: OptionsNode,
  variable: VariableNode,
};

export const GENERIC_NODE_TYPE = "grcBlock";

export const nodeTypes = { [GENERIC_NODE_TYPE]: GenericBlockNode, ...blockOverrides };

export const nodeTypeFor = (blockId) => (blockId in blockOverrides ? blockId : GENERIC_NODE_TYPE);
