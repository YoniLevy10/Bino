/**
 * API Validation & Error Handling - Phase 2: Data Safety
 * Centralizes validation logic, error responses, and rate limiting
 */

import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TICKET_STATUSES } from '@/lib/ticket-status'
import { checkRateLimit } from '@/lib/rate-limit'

// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: ValidationError[];
  timestamp: string;
  requestId: string;
}

export interface RateLimitInfo {
  key: string
  requestCount: number
  resetTime: number
  isLimited: boolean
  remaining?: number
}

export interface ValidationRule {
  type?: string;
  required?: boolean;
  enum?: string[];
  pattern?: RegExp | string;
  minLength?: number;
  maxLength?: number;
}

export type ValidationSchema = Record<string, ValidationRule>;

// ============================================================================
// 2. VALIDATION SCHEMAS
// ============================================================================

export const ValidationSchemas = {
  ticket: {
    create: {
      client_id: { type: 'string', required: false, pattern: /^[a-f0-9-]{36}$/ },
      project_id: { type: 'string', required: true, pattern: /^[a-f0-9-]{36}$/ },
      title: { type: 'string', required: true, minLength: 3, maxLength: 255 },
      description: { type: 'string', required: true, minLength: 10 },
      priority: { type: 'string', required: false, enum: ['HIGH', 'MEDIUM', 'LOW'] },
      assigned_to: { type: 'string', required: false, pattern: /^[a-f0-9-]{36}$|^null$/ },
      phone_number: { type: 'string', required: false, pattern: /^\+?[1-9]\d{1,14}$/ },
    },
    update: {
      status: { type: 'string', required: false, enum: [...TICKET_STATUSES] },
      assigned_to: { type: 'string', required: false, pattern: /^[a-f0-9-]{36}$|^null$/ },
      priority: { type: 'string', required: false, enum: ['HIGH', 'MEDIUM', 'LOW'] },
      notes: { type: 'string', required: false, maxLength: 2000 },
    },
  },
  project: {
    create: {
      client_id: { type: 'string', required: false, pattern: /^[a-f0-9-]{36}$/ },
      project_code: { type: 'string', required: true, minLength: 2, maxLength: 20, pattern: /^[A-Z0-9_]+$/ },
      name: { type: 'string', required: true, minLength: 3, maxLength: 100 },
      description: { type: 'string', required: false, maxLength: 500 },
    },
  },
  client: {
    create: {
      name: { type: 'string', required: true, minLength: 2, maxLength: 100 },
      email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      phone: { type: 'string', required: false, pattern: /^\+?[1-9]\d{1,14}$/ },
      country: { type: 'string', required: false, minLength: 2, maxLength: 2, pattern: /^[A-Z]{2}$/ },
    },
  },
};

// ============================================================================
// 3. VALIDATOR CLASS
// ============================================================================

export class RequestValidator {
  private errors: ValidationError[] = [];

  reset(): void {
    this.errors = [];
  }

  validate(data: unknown, schema: ValidationSchema): boolean {
    this.errors = [];

    if (typeof data !== 'object' || data === null) {
      this.errors.push({ field: '_root', message: 'Request body must be a JSON object' });
      return false;
    }

    const obj = data as Record<string, unknown>;

    for (const [field, rules] of Object.entries(schema)) {
      const value = obj[field];

      // Check required
      if (rules.required && (value === undefined || value === null || value === '')) {
        this.errors.push({ field, message: `${field} is required`, value });
        continue;
      }

      // If not required and missing, skip further validation
      if (!rules.required && (value === undefined || value === null)) {
        continue;
      }

      // Type check
      if (rules.type && typeof value !== rules.type) {
        this.errors.push({
          field,
          message: `${field} must be of type ${rules.type}`,
          value,
        });
        continue;
      }

      // Enum check
      if (rules.enum && !rules.enum.includes(String(value))) {
        this.errors.push({
          field,
          message: `${field} must be one of: ${rules.enum.join(', ')}`,
          value,
        });
        continue;
      }

      // Pattern check
      if (rules.pattern) {
        const pattern = typeof rules.pattern === 'string' ? new RegExp(rules.pattern) : rules.pattern
        if (!pattern.test(String(value))) {
          this.errors.push({
            field,
            message: `${field} format is invalid`,
            value,
          });
          continue;
        }
      }

      // Length checks
      if (typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) {
          this.errors.push({
            field,
            message: `${field} must be at least ${rules.minLength} characters`,
            value,
          });
          continue;
        }

        if (rules.maxLength && value.length > rules.maxLength) {
          this.errors.push({
            field,
            message: `${field} must be at most ${rules.maxLength} characters`,
            value,
          });
          continue;
        }
      }
    }

    return this.errors.length === 0;
  }

  getErrors(): ValidationError[] {
    return this.errors;
  }
}

// ============================================================================
// 4. RESPONSE BUILDERS
// ============================================================================

export class ResponseBuilder {
  static success<T>(data: T, requestId: string): ApiResponse<T> {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }

  static error(message: string, requestId: string, statusCode = 400): [ApiResponse<null>, number] {
    return [
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
        requestId,
      },
      statusCode,
    ];
  }

  static validationError(errors: ValidationError[], requestId: string): [ApiResponse<null>, number] {
    return [
      {
        success: false,
        error: 'Validation failed',
        errors,
        timestamp: new Date().toISOString(),
        requestId,
      },
      400,
    ];
  }

  static notFound(resource: string, requestId: string): [ApiResponse<null>, number] {
    return [
      {
        success: false,
        error: `${resource} not found`,
        timestamp: new Date().toISOString(),
        requestId,
      },
      404,
    ];
  }

  static unauthorized(requestId: string): [ApiResponse<null>, number] {
    return [
      {
        success: false,
        error: 'Unauthorized',
        timestamp: new Date().toISOString(),
        requestId,
      },
      401,
    ];
  }

  static serverError(requestId: string): [ApiResponse<null>, number] {
    return [
      {
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
        requestId,
      },
      500,
    ];
  }
}

export class ApiError extends Error {
  status: number
  expose: boolean
  constructor(message: string, status: number, expose = false) {
    super(message)
    this.status = status
    this.expose = expose
  }
}

// ============================================================================
// 5. REQUEST UTILITIES
// ============================================================================

export async function parseRequest(request: NextRequest): Promise<[unknown, string, string] | null> {
  try {
    const requestId = generateRequestId();
    const contentType = request.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      return null;
    }

    const body = await request.json();
    const clientId = 'single-tenant';

    return [body, requestId, clientId];
  } catch {
    return null;
  }
}

export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// ============================================================================
// 6. RATE LIMITING
// ============================================================================

const memoryRateLimitMap = new Map<string, RateLimitInfo>()

export function checkRateLimitMemory(key: string, windowMs = 60_000, maxRequests = 100): RateLimitInfo {
  const now = Date.now()
  const existing = memoryRateLimitMap.get(key)

  if (!existing || now > existing.resetTime) {
    const info: RateLimitInfo = {
      key,
      requestCount: 1,
      resetTime: now + windowMs,
      isLimited: false,
      remaining: Math.max(maxRequests - 1, 0),
    }
    memoryRateLimitMap.set(key, info)
    return info
  }

  existing.requestCount++
  existing.isLimited = existing.requestCount > maxRequests
  existing.remaining = Math.max(maxRequests - existing.requestCount, 0)
  return existing
}

/** Rate limit by IP + endpoint (table `rate_limits`, RPC `bamakor_rate_limit_ip_endpoint`). */
export async function checkRateLimitIpEndpoint(params: {
  supabaseAdmin: SupabaseClient
  ip: string
  endpoint: string
  maxRequests?: number
}): Promise<{ isLimited: boolean; currentCount?: number }> {
  const max = params.maxRequests ?? 20
  const { data, error } = await params.supabaseAdmin.rpc('bamakor_rate_limit_ip_endpoint', {
    p_ip: params.ip,
    p_endpoint: params.endpoint,
    p_max: max,
  })
  if (error) {
    return { isLimited: false }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    isLimited: !!row?.is_limited,
    currentCount: typeof row?.current_count === 'number' ? row.current_count : undefined,
  }
}

export async function checkRateLimitDistributed(params: {
  supabaseAdmin: SupabaseClient
  key: string
  windowMs?: number
  maxRequests?: number
}): Promise<RateLimitInfo> {
  const windowMs = params.windowMs ?? 60_000
  const maxRequests = params.maxRequests ?? 100

  const r = await checkRateLimit(params.supabaseAdmin, params.key, maxRequests, windowMs)
  if ('rpcFailed' in r && r.rpcFailed) {
    return checkRateLimitMemory(params.key, windowMs, maxRequests)
  }

  const resetAt = r.resetMs ?? Date.now() + windowMs
  const remaining = r.remaining
  return {
    key: params.key,
    requestCount: remaining !== undefined ? maxRequests - remaining : 0,
    resetTime: resetAt,
    isLimited: r.isLimited,
    remaining,
  }
}

// ============================================================================
// 7. SAFE API RESPONSE WRAPPER
// ============================================================================

export async function withErrorHandling<T>(
  handler: () => Promise<T>,
  requestId: string,
): Promise<[T | null, string | null, number]> {
  try {
    const result = await handler();
    return [result, null, 200];
  } catch (error) {
    if (error instanceof ApiError) {
      return [null, error.expose ? error.message : 'Internal server error', error.status]
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred';

    if (message.includes('not found')) {
      return [null, message, 404];
    }

    if (message.includes('unauthorized') || message.includes('permission')) {
      return [null, message, 401];
    }

    if (message.includes('already exists') || message.includes('duplicate')) {
      return [null, message, 409];
    }

    console.error(`[${requestId}] Error:`, error);
    return [null, 'Internal server error', 500];
  }
}

// ============================================================================
// 8. SANITIZATION UTILITIES
// ============================================================================

export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, 2000);
}

export function sanitizeId(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const s = input.trim().toLowerCase()
  // UUID format validation
  if (!/^[a-f0-9-]{36}$/.test(s)) return null
  return s
}

export function sanitizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.toLowerCase().trim();
  if (!email.includes('@')) return null;
  return email.slice(0, 255);
}
