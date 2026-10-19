export function isPublicDemoRoute(hash = window.location.hash) {
  return hash.replace(/^#/, "").replace(/\/$/, "") === "/demo";
}

export function assertAccountAccess() {
  if (isPublicDemoRoute()) {
    throw new Error("Account services are unavailable in the public demo.");
  }
}
