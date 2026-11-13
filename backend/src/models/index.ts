// Mongoose model registration for Build Your Christmas.
// Importing this module once ensures every model is registered before
// controllers/services try to populate it.
//
// NOTE: Accessory đã được tái sinh ở Phase 1 Tree Customizer dưới dạng mặt
// hàng tồn kho độc lập (collection `accessories`). Style/Category info vẫn
// nằm gọn trong TreeProduct.description.
// AI render dùng TreeProduct.coverImage + description làm reference.
export * from "./User";
export { Tree } from "./Tree";
export type { ITree, TreeSize } from "./Tree";
export { TreeProduct } from "./TreeProduct";
export type { ITreeProduct } from "./TreeProduct";
export { TreeCode } from "./TreeCode";
export type { ITreeCode } from "./TreeCode";
export { Accessory } from "./Accessory";
export type {
  IAccessory,
  AccessorySlotType,
  AccessoryShadow,
  IAccessoryAnchor,
} from "./Accessory";
export { SlotMap } from "./SlotMap";
export type { ISlotMap, ISlotDefinition, SlotDepth } from "./SlotMap";
export { ACCESSORY_SLOT_TYPES } from "./Accessory";
export { ACCESSORY_SHADOW_TYPES } from "./Accessory";
export { SLOT_DEPTH_TYPES } from "./SlotMap";
export * from "./Design";
export * from "./Cart";
export * from "./CartItem";
export * from "./Order";
export * from "./Notification";
export * from "./Coupon";
export * from "./Banner";
export * from "./MediaAsset";
export * from "./Review";
export * from "./Conversation";
export * from "./Message";
export * from "./HandoffRequest";
export * from "./KnowledgeDocument";
