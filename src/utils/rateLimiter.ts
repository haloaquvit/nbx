/**
 * CLIENT-SIDE RATE LIMITING UTILITY
 * Provides basic protection against abuse on the client side
 */

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  skipSuccessfulRequests?: boolean
}

interface RequestLog {
  timestamp: number
  success: boolean
}

class RateLimiter {
  private requests: Map<string, RequestLog[]> = new Map()

  constructor(private config: RateLimitConfig) {}

  isAllowed(key: string, success: boolean = true): boolean {
    const now = Date.now()
    const requests = this.requests.get(key) || []
    
    // Clean up old requests outside the window
    const windowStart = now - this.config.windowMs
    const activeRequests = requests.filter(req => req.timestamp > windowStart)
    
    // Count requests (skip successful ones if configured)
    const countableRequests = this.config.skipSuccessfulRequests 
      ? activeRequests.filter(req => !req.success)
      : activeRequests

    if (countableRequests.length >= this.config.maxRequests) {
      return false
    }

    // Add current request
    activeRequests.push({ timestamp: now, success })
    this.requests.set(key, activeRequests)
    
    return true
  }

  reset(key: string): void {
    this.requests.delete(key)
  }

  getRemainingRequests(key: string): number {
    const now = Date.now()
    const requests = this.requests.get(key) || []
    const windowStart = now - this.config.windowMs
    const activeRequests = requests.filter(req => req.timestamp > windowStart)
    
    const countableRequests = this.config.skipSuccessfulRequests 
      ? activeRequests.filter(req => !req.success)
      : activeRequests

    return Math.max(0, this.config.maxRequests - countableRequests.length)
  }

  getResetTime(key: string): number {
    const requests = this.requests.get(key) || []
    if (requests.length === 0) return 0
    
    const oldestRequest = Math.min(...requests.map(req => req.timestamp))
    return oldestRequest + this.config.windowMs
  }
}

// Pre-configured rate limiters for common operations
export const authRateLimit = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  skipSuccessfulRequests: true
})

export const apiRateLimit = new RateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
  skipSuccessfulRequests: false
})

export const sensitiveOperationRateLimit = new RateLimiter({
  maxRequests: 10,
  windowMs: 5 * 60 * 1000, // 5 minutes
  skipSuccessfulRequests: false
})

/**
 * Rate limiting decorator for async functions
 */
export function withRateLimit<T extends any[], R>(
  rateLimiter: RateLimiter,
  keyGenerator: (...args: T) => string,
  onLimitExceeded?: () => void
) {
  return function decorator(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: T): Promise<R> {
      const key = keyGenerator(...args)
      
      if (!rateLimiter.isAllowed(key, false)) {
        if (onLimitExceeded) {
          onLimitExceeded()
        }
        throw new Error('Rate limit exceeded. Please try again later.')
      }

      try {
        const result = await originalMethod.apply(this, args)
        rateLimiter.isAllowed(key, true) // Mark as successful
        return result
      } catch (error) {
        // Mark as failed (already recorded above)
        throw error
      }
    }

    return descriptor
  }
}

/**
 * Hook for rate limiting in React components
 */
export function useRateLimit(rateLimiter: RateLimiter, key: string) {
  const isAllowed = (success: boolean = true) => rateLimiter.isAllowed(key, success)
  const remaining = rateLimiter.getRemainingRequests(key)
  const resetTime = rateLimiter.getResetTime(key)
  
  return {
    isAllowed,
    remaining,
    resetTime,
    reset: () => rateLimiter.reset(key)
  }
}

/**
 * Utility to generate user-specific rate limiting keys
 */
export function getUserRateLimitKey(userId: string, operation: string): string {
  return `${userId}:${operation}`
}

/**
 * Utility to generate IP-based rate limiting keys (fallback)
 */
export function getIPRateLimitKey(operation: string): string {
  // In a real app, you'd get the actual IP from the server
  // For client-side, we use a session-based approach
  let sessionId = sessionStorage.getItem('rate_limit_session')
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15)
    sessionStorage.setItem('rate_limit_session', sessionId)
  }
  return `session:${sessionId}:${operation}`
}

/**
 * Global rate limit check for sensitive operations
 */
export function checkSensitiveOperationLimit(userId: string, operation: string): boolean {
  const key = getUserRateLimitKey(userId, operation)
  return sensitiveOperationRateLimit.isAllowed(key, false)
}

/**
 * Authentication rate limit check
 */
export function checkAuthLimit(identifier: string): boolean {
  const key = `auth:${identifier}`
  return authRateLimit.isAllowed(key, false)
}

export default RateLimiter