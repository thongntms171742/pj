import mongoose, { Schema, Document } from "mongoose";
import { SERVICE_PROVINCE_ID } from "../config/business";

export interface IWarehouseConfig extends Document {
  key: string;
  name: string;
  phone: string;
  address: string;
  communeId: string;
  communeName: string;
  district?: string;
  provinceId: string;
  provinceName: string;
  lat?: number;
  lng?: number;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const WarehouseConfigSchema = new Schema<IWarehouseConfig>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    communeId: { type: String, default: "" },
    communeName: { type: String, default: "" },
    district: { type: String, default: "" },
    provinceId: { type: String, default: SERVICE_PROVINCE_ID },
    provinceName: { type: String, default: "Thành phố Hồ Chí Minh" },
    lat: { type: Number },
    lng: { type: Number },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export const WarehouseConfig = mongoose.model<IWarehouseConfig>(
  "WarehouseConfig",
  WarehouseConfigSchema
);

