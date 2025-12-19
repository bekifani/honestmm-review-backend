import { Request, Response, NextFunction } from 'express';

const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);

const credentials = (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
    }
    next();
}

export default credentials;