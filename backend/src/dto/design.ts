// Re-export RoomDesign DTO từ service để controllers / routes import từ 1 path.
export { buildRoomDesignResponse } from "../services/designService";
export type { RoomDesignResponse } from "../services/designService";
