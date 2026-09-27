import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

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
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Chưa đăng nhập" });
    return;
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Token không hợp lệ hoặc đã hết hạn" });
  }
}

/**
 * Optional auth — attaches `req.user` if a valid token is present,
 * but does NOT reject the request when there's no token.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const token = header.slice(7);
      req.user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      // invalid token → treat as anonymous
    }
  }
  next();
}

/**
 * Admin-only guard — must be used AFTER requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.roles.includes("admin")) {
    res.status(403).json({ error: "Chỉ admin mới có quyền truy cập" });
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
