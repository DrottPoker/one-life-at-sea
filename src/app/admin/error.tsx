"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return <section role="alert"><h2>Administration could not be loaded</h2><p>Check your connection and administrator access.</p><button onClick={reset}>Try again</button></section>;
}

