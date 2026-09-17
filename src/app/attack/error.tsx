"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="o-attack-loading"><h1>Connection interrupted</h1>
    <p>Your battle remains saved. Reload to continue.</p><button onClick={reset} className="o-training-button">Reload battle</button></main>;
}
