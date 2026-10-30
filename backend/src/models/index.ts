// Mongoose model registration for Build Your Christmas.
// Importing this module once ensures every model is registered before
// controllers/services try to populate it.
//
// NOTE: Accessory / Style / Category / AIDesign đã bị purge trong refactor
// phụ kiện. Style/Accessory info giờ nằm gọn trong TreeProduct.description.
// AI render dùng TreeProduct.coverImage + description làm reference.
export * from "./User";
export { Tree } from "./Tree";
export type { ITree, TreeSize } from "./Tree";
export { TreeProduct } from "./TreeProduct";
export type { ITreeProduct } from "./TreeProduct";
export { TreeCode } from "./TreeCode";
export type { ITreeCode } from "./TreeCode";
export * from "./Message";
export * from "./Design";
export * from "./Cart";
export * from "./CartItem";
export * from "./Order";
export * from "./Notification";
export * from "./Coupon";
export * from "./Banner";
export * from "./MediaAsset";
export * from "./Conversation";
export * from "./Review";
