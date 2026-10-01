import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { sendError, ErrorCode } from "../utils/errors";
import { User } from "../models/User";

const JWT_SECRET = process.env.JWT_SECRET || "thriftit_super_secret_key_change_me";

export interface JwtPayload {
  id: string;
  email: string;
  roles: string[];
}

// Extend Express Request to carry authenticated user info
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Mandatory auth — returns 401 if no valid token.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    sendError(res, ErrorCode.UNAUTHORIZED, "Chưa đăng nhập");
    return;
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Verify user in DB to check accountStatus
    const user = await User.findById(decoded.id).select("accountStatus");
    if (!user) {
      sendError(res, ErrorCode.UNAUTHORIZED, "Tài khoản không tồn tại");
      return;
    }
    if (user.accountStatus === "suspended") {
      sendError(res, ErrorCode.FORBIDDEN, "Tài khoản của bạn đã bị khóa");
      return;
    }

    req.user = decoded;
    next();
  } catch {
    sendError(res, ErrorCode.TOKEN_INVALID, "Token không hợp lệ hoặc đã hết hạn");
  }
}

/**
 * Optional auth — attaches `req.user` if a valid token is present,
 * but does NOT reject the request when there's no token.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const token = header.slice(7);
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const user = await User.findById(decoded.id).select("accountStatus");
      if (user && user.accountStatus !== "suspended") {
        req.user = decoded;
      }
    } catch {
      // invalid token or user suspended → treat as anonymous
    }
  }
  next();
}

/**
 * Admin-only guard — must be used AFTER requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.roles.includes("admin")) {
    sendError(res, ErrorCode.FORBIDDEN, "Chỉ admin mới có quyền truy cập");
    return;
  }
  next();
}

/**
 * Create a signed JWT for the given user.
 */
export function signToken(payload: JwtPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}