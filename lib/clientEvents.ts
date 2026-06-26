"use client";

/**
 * Tiny client-side pub/sub so panels stay in sync without a page reload.
 * When signals change (cycling a card, accepting a monitor proposal) the
 * return outlook and tracker re-derive their adjusted return AND likelihood
 * live. When holdings change (saving holdings, confirming an allocation) the
 * conviction meter and allocator balances refresh.
 */

const SIGNALS = "signals:changed";
const HOLDINGS = "holdings:changed";

function notify(name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

function subscribe(name: string, cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(name, cb);
  return () => window.removeEventListener(name, cb);
}

export const notifySignalsChanged = () => notify(SIGNALS);
export const onSignalsChanged = (cb: () => void) => subscribe(SIGNALS, cb);

export const notifyHoldingsChanged = () => notify(HOLDINGS);
export const onHoldingsChanged = (cb: () => void) => subscribe(HOLDINGS, cb);
