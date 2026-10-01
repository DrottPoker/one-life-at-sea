"use client";
export default function AdminError({ retry }: { retry: () => void }) {
  return <section role="alert"><h2>Administration could not be loaded</h2><p>Check your connection and administrator access.</p><button onClick={retry}>Try again</button></section>;
}

