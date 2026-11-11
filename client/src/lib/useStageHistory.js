import { useEffect, useState } from "react";

// The stage history of the deals a popup lists, loaded when the popup opens:
//   { status: "idle" | "loading" | "ready" | "error", byId: { [dealId]: { entries, error } }, error }
// One request for the whole list (the server fetches the deals from Bigin a few
// at a time and caches them), so opening a stage popup never fires one request
// per row from the browser.
export function useStageHistory(ids, enabled) {
  const key = ids.join(",");
  const [state, setState] = useState({ status: "idle", byId: {}, error: null });

  useEffect(() => {
    if (!enabled || ids.length === 0) {
      setState({ status: "idle", byId: {}, error: null });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, status: "loading", error: null }));
    fetch(`/api/crm-analysis/stage-history?ids=${ids.slice(0, 150).join(",")}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => setState({ status: "ready", byId: json.histories || {}, error: null }))
      .catch((e) => {
        if (e.name !== "AbortError") setState({ status: "error", byId: {}, error: e.message });
      });
    return () => controller.abort();
    // `key` stands for `ids`: a new array with the same ids must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return state;
}