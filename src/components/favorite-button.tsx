"use client";

import { useSyncExternalStore } from "react";

const storageKey = "la-tickets:post-malone";
let fallback = false;
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("favorite-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("favorite-change", callback);
  };
}
function getSnapshot() {
  try { return localStorage.getItem(storageKey) === "true"; } catch { return fallback; }
}

export function FavoriteButton() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, () => false);
  function toggle() {
    const next = !saved;
    fallback = next;
    try { localStorage.setItem(storageKey, String(next)); } catch { /* Keep working without storage. */ }
    window.dispatchEvent(new Event("favorite-change"));
  }
  return <button className="favorite-button" type="button" aria-pressed={saved} onClick={toggle}><span aria-hidden="true">{saved ? "♥" : "♡"}</span>{saved ? "Saved to favorites" : "Add to favorites"}</button>;
}
