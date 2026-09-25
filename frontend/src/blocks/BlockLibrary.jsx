// Loads the GNU Radio block library from /api/blocks and shares it via context
import React, { useEffect, useMemo, useState } from "react";
import { BlockLibraryContext } from "./useBlockLibrary";

export function BlockLibraryProvider({ children }) {
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/blocks")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setTree)
      .catch((err) => setError(err.message));
  }, []);

  // Flat id -> definition lookup (a block can appear in several categories)
  const byId = useMemo(() => {
    const map = {};
    const walk = (node) => {
      for (const [key, value] of Object.entries(node)) {
        if (key === "_blocks") value.forEach((b) => { map[b.id] ??= b; });
        else walk(value);
      }
    };
    if (tree) walk(tree);
    return map;
  }, [tree]);

  const value = useMemo(() => ({ tree, byId, error }), [tree, byId, error]);
  return <BlockLibraryContext.Provider value={value}>{children}</BlockLibraryContext.Provider>;
}
