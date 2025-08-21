import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

class SimpleRateLimiter {
  private store: RateLimitStore = {};
  private windowMs: number;
  private maxRequests: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    // Limpeza automática a cada 5 minutos
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      if (this.store[key]!.resetTime < now) {
        delete this.store[key];
      }
    });
  }

  private getKey(req: Request): string {
    // Usar IP como chave principal
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `rate_limit:${ip}`;
  }

  public middleware = (req: Request, res: Response, next: NextFunction): void => {
    const key = this.getKey(req);
    const now = Date.now();
    
    // Inicializar ou resetar se expirou
    if (!this.store[key] || this.store[key]!.resetTime < now) {
      this.store[key] = {
        count: 0,
        resetTime: now + this.windowMs
      };
    }

    const record = this.store[key]!;
    record.count++;

    // Headers de rate limit
    res.set({
      'X-RateLimit-Limit': this.maxRequests.toString(),
      'X-RateLimit-Remaining': Math.max(0, this.maxRequests - record.count).toString(),
      'X-RateLimit-Reset': new Date(record.resetTime).toISOString()
    });

    // Verificar se excedeu o limite
    if (record.count > this.maxRequests) {
      logger.warn('Rate limit excedido', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.url,
        method: req.method,
        count: record.count,
        limit: this.maxRequests
      });

      res.status(429).json({
        success: false,
        error: {
          message: 'Muitas requisições. Tente novamente mais tarde.',
          statusCode: 429,
          retryAfter: Math.ceil((record.resetTime - now) / 1000)
        }
      });
      return;
    }

    next();
  };

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Instância do rate limiter
const rateLimiterInstance = new SimpleRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutos
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
);

export const rateLimiter = rateLimiterInstance.middleware;

// Cleanup na saída do processo
process.on('SIGTERM', () => rateLimiterInstance.destroy());
process.on('SIGINT', () => rateLimiterInstance.destroy());