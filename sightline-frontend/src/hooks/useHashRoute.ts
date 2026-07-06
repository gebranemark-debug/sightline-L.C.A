import { useEffect, useState, useCallback } from "react";

export type Tab = "samples" | "borrowers" | "review" | "declined";

export type Route = {
  tab: Tab;
  borrowerId?: string;
};

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#/, "");
  if (clean === "" || clean === "samples") return { tab: "samples" };
  if (clean === "borrowers") return { tab: "borrowers" };
  if (clean === "review") return { tab: "review" };
  if (clean === "declined") return { tab: "declined" };
  const borrowerMatch = clean.match(/^borrowers\/(.+)$/);
  if (borrowerMatch) return { tab: "borrowers", borrowerId: borrowerMatch[1] };
  return { tab: "samples" };
}

/**
 * Tab state + deep-link routing via URL hash. Four tabs plus one nested view
 * (borrower detail via `#borrowers/{id}`). Hash makes tabs shareable — an
 * officer can send a colleague `#review` or `#borrowers/{id}` directly.
 *
 * navigate() writes to `location.hash`, which triggers `hashchange` and flows
 * back into state; no need to setRoute manually from the caller.
 */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof window !== "undefined" ? window.location.hash : ""),
  );

  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = useCallback((hash: string) => {
    const normalized = hash.startsWith("#") ? hash : `#${hash}`;
    if (window.location.hash === normalized) return;
    window.location.hash = normalized;
  }, []);

  return { route, navigate };
}
