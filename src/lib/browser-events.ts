export function subscribeToForeground(refresh: () => void, includeHistory = false): () => void {
  const foreground = () => {
    if (document.visibilityState === "visible") refresh();
  };
  const events = includeHistory ? ["focus", "online", "popstate", "pageshow"] : ["focus", "online"];
  for (const event of events) window.addEventListener(event, foreground);
  document.addEventListener("visibilitychange", foreground);
  return () => {
    for (const event of events) window.removeEventListener(event, foreground);
    document.removeEventListener("visibilitychange", foreground);
  };
}
