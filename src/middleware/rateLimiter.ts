import rateLimit from 'express-rate-limit';

// 🌐 Global rate limiter (applies to all routes)
const globalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3000, // 3000 requests per 10 minutes (~300/minute)
  message: 'Too many requests from this IP, please try again after 10 minutes',
  skipSuccessfulRequests: true,
});

// 🔐 Login-specific rate limiter
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 mins
  max: 25, // only 25 login attempts per IP
  message: 'Too many login attempts. Try again later.',
})

export { globalLimiter, loginLimiter };
