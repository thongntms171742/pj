import { Request, Response } from "express";
import {
  getProvinces as fetchProvinces,
  getCommunesByProvince as fetchCommunesByProvince,
  getAllCommunes as fetchAllCommunes,
  isValidEffectiveDate,
  AddressServiceError,
} from "../services/addressService";
import { sendError, ErrorCode, handleInternalError } from "../utils/errors";
import { ok } from "../utils/respond";

function parseEffectiveDate(req: Request, res: Response): string | null {
  const effectiveDate = (req.query.effectiveDate as string) || "latest";
  if (!isValidEffectiveDate(effectiveDate)) {
    sendError(
      res,
      ErrorCode.INVALID_EFFECTIVE_DATE,
      "effectiveDate must be 'latest' or YYYY-MM-DD",
      400
    );
    return null;
  }
  return effectiveDate;
}

// ── GET /api/addresses/provinces ──────────────────────────────────────────────
export const getProvinces = async (req: Request, res: Response): Promise<void> => {
  try {
    const effectiveDate = parseEffectiveDate(req, res);
    if (!effectiveDate) return;

    const result = await fetchProvinces(effectiveDate);
    ok(res, result);
  } catch (err: any) {
    if (err instanceof AddressServiceError) {
      sendError(res, err.code as any, err.message, err.statusCode);
      return;
    }
    handleInternalError(res, err, "[address] getProvinces error");
  }
};

// ── GET /api/addresses/provinces/:provinceId/communes ─────────────────────────
export const getCommunesByProvince = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provinceId } = req.params;
    if (!provinceId || typeof provinceId !== "string" || !/^[a-zA-Z0-9_-]{1,10}$/.test(provinceId.trim())) {
      sendError(res, ErrorCode.INVALID_INPUT, "provinceId không hợp lệ", 400);
      return;
    }

    const effectiveDate = parseEffectiveDate(req, res);
    if (!effectiveDate) return;

    const result = await fetchCommunesByProvince(provinceId.trim(), effectiveDate);
    ok(res, result);
  } catch (err: any) {
    if (err instanceof AddressServiceError) {
      sendError(res, err.code as any, err.message, err.statusCode);
      return;
    }
    handleInternalError(res, err, "[address] getCommunesByProvince error");
  }
};

// ── GET /api/addresses/communes ───────────────────────────────────────────────
export const getAllCommunes = async (req: Request, res: Response): Promise<void> => {
  try {
    const effectiveDate = parseEffectiveDate(req, res);
    if (!effectiveDate) return;

    const result = await fetchAllCommunes(effectiveDate);
    ok(res, result);
  } catch (err: any) {
    if (err instanceof AddressServiceError) {
      sendError(res, err.code as any, err.message, err.statusCode);
      return;
    }
    handleInternalError(res, err, "[address] getAllCommunes error");
  }
};
