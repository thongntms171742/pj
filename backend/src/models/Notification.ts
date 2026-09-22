import mongoose, { Schema, Document, Types } from "mongoose";

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: "order" | "chat" | "promo" | "system" | "review";
  title: string;
  message: string;
  isRead: boolean;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["order", "chat", "promo", "system", "review"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, isRead: 1 });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema);
