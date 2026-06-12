const STORAGE_KEY = "catalog:return-state";
const TTL_MS = 10 * 60 * 1000;

export type CatalogReturnState = {
  catalogUrl: string;
  article: string;
  scrollY: number;
  productViewportTop: number;
  savedAt: number;
};

export function saveCatalogReturnState(state: Omit<CatalogReturnState, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const next: CatalogReturnState = { ...state, savedAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function readCatalogReturnState(): CatalogReturnState | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CatalogReturnState;
    if (!parsed || typeof parsed.article !== "string" || Date.now() - parsed.savedAt > TTL_MS) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCatalogReturnState(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function restoreCatalogScroll(state: CatalogReturnState): void {
  if (typeof window === "undefined") return;
  window.scrollTo({
    top: Math.max(0, state.scrollY),
    behavior: "auto",
  });
}
