// Re-export of designService.buildDesignResponse so controllers can import
// DTO mappers from a single path (`dto/design`) instead of remembering
// which service the function lives in. Defined here for discoverability.
export { buildDesignResponse } from "../services/designService";
export type { DesignResponse } from "../services/designService";
