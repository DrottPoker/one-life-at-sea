"use client";

export default function ForumsError({ retry }: { retry: () => void }) {
  return <div className="o-panel-body">
    <p>We could not load the forum. Please try again.</p>
    <button type="button" className="o-primary" onClick={retry}>Try again</button>
  </div>;
}
