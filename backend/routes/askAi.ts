import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { protect } from '../middleware/auth.js';
import { askAIController } from '../controllers/knowledgeController.js';

const router = Router();

/**
 * Ask AI — RAG-style free-form Q&A across FAQs + Knowledge Base + Community.
 * Used by the floating "Ask AI" search bar on the frontend.
 *
 * Access policy:
 *  - Public — anonymous users get 5 free AI searches per browser per 24h
 *    (enforced client-side via localStorage; see AskAIButton.tsx).
 *  - Logged-in users are unlimited.
 *  - Backend abuse protection: anonymous requests are throttled to 20/min per
 *    IP, logged-in users to 30/min per IP, so a determined attacker can't
 *    drain the AI quota by just clearing localStorage.
 */
const anonAiLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 20,                 // 20 anonymous AI searches per minute per IP
  keyGenerator: (req: Request) => `anon:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Skip the anon limiter if a valid auth token is present (the user
    // limiter below will handle them).
    const auth = req.headers.authorization;
    return !!(auth && auth.startsWith('Bearer '));
  },
  message: { message: 'Too many AI searches. Please wait a moment and try again.' },
});

const authedAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,                 // 30 logged-in AI searches per minute per user
  keyGenerator: (req: Request) => `auth:${ipKeyGenerator(req.ip ?? 'unknown')}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many AI searches. Please slow down.' },
});

router.post('/', anonAiLimiter, async (req: Request, res: Response, next: NextFunction) => {
  // If a Bearer token is present, verify it (best-effort) and apply the
  // authenticated limiter. Invalid/expired tokens fall through to the anon
  // path — public access is the default; auth only changes the rate limit.
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return protect(req, res, () => authedAiLimiter(req, res, next));
  }
  next();
}, askAIController);

export default router;
