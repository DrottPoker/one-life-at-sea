"use client";

export default function ForumsError({ reset }: { reset: () => void }) {
  return <div className="o-panel-body">
    <p>We could not load the forum. Please try again.</p>
    <button type="button" className="o-primary" onClick={reset}>Try again</button>
  </div>;
}
