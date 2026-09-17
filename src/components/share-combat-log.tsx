"use client";
import { useState } from "react";
export function ShareCombatLog() {
  const [message, setMessage] = useState("");
  return <div className="o-log-share"><button className="o-training-button" onClick={async () => {
    try { await navigator.clipboard.writeText(window.location.href); setMessage("Link copied"); }
    catch { setMessage("Copy the address from your browser to share this log."); }
  }}>Copy public link</button><span role="status">{message}</span></div>;
}
