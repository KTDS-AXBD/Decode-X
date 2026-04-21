export function isLegacyMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("legacy") === "1";
}
