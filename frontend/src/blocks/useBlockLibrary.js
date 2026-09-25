import { createContext, useContext } from "react";

export const BlockLibraryContext = createContext({ tree: null, byId: {}, error: null });

export const useBlockLibrary = () => useContext(BlockLibraryContext);
export const useBlockDef = (blockId) => useContext(BlockLibraryContext).byId[blockId];
