// Backward-compatibility shim — routes to the new modular intelligence files.
// The original retrieve() and priceScenario() are kept so existing tests pass.

export { ragAnswer as retrieve } from './rag.mjs';
export { analyzeFeedback } from './sentiment.mjs';
export { priceScenario } from './pricing.mjs';
export { classifyAndRouteHospitalityRequest, getNugenStatus, isNugenConfigured } from './nugen.mjs';

// Legacy named export used by tests
export const knowledge = [];

