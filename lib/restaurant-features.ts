export type FeatureKey = "giftCards" | "notifications" | "deposits";
export type FeatureState = { isDemo?: boolean; features?: Record<string, boolean> };
export function moduleEnabled(state: FeatureState | null, key: FeatureKey) {
  // Missing fields are supported during the backend-first rollout; missing bootstrap is not ready.
  return state !== null && (state.features?.[key] ?? ["giftCards", "notifications"].includes(key));
}
export function unavailableRoute(state: FeatureState | null, pathname: string) {
  if ((pathname === "/senas" || pathname.startsWith("/senas/")) && !moduleEnabled(state, "deposits")) return "Señas y pagos no está habilitado para este restaurante.";
  if (state?.isDemo && (pathname === "/chat" || pathname.startsWith("/chat/"))) return "El chat externo está deshabilitado en la cuenta demo. Podés probar las funciones internas con datos de prueba.";
  if ((pathname === "/gift-cards" || pathname.startsWith("/gift-cards/")) && !moduleEnabled(state, "giftCards")) return "Gift Cards no está habilitado para este restaurante.";
  return null;
}
