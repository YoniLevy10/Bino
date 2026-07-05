/**
 * Logging & Monitoring - Phase 2: Data Safety
 * Structured logging for debugging, auditing, and monitoring
 */

import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

// ============================================================================
// 1. LOG LEVEL DEFINITIONS
// ============================================================================

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
};

// ============================================================================
// 2. LOG ENTRY STRUCTURE
// ============================================================================

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  requestId?: string;
  clientId?: string;
  userId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number; // ms
  metadata?: Record<string, unknown>;
}

// ============================================================================
// 3. LOGGER CONFIGURATION
// ============================================================================

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableRemote: boolean;
  maxLogSize: number; // MB
  defaultCategory: string;
}

/** API routes do not run app/layout — they must get sane defaults here (not DEBUG + duplicate console). */
export function buildDefaultLoggerConfig(): LoggerConfig {
  const isProd = process.env.NODE_ENV === 'production'
  const hasRemoteEndpoint = Boolean((process.env.LOGGING_ENDPOINT || '').trim())
  return {
    minLevel: isProd ? LogLevel.WARN : LogLevel.DEBUG,
    enableConsole: true,
    enableFile: false,
    enableRemote: isProd && hasRemoteEndpoint,
    maxLogSize: 100,
    defaultCategory: 'APP',
  }
}

export const DEFAULT_LOGGER_CONFIG: LoggerConfig = buildDefaultLoggerConfig()

// ============================================================================
// 4. MAIN LOGGER CLASS
// ============================================================================

export class Logger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private bufferSize = 1000;
  private requestContext: Map<string, Partial<LogEntry>> = new Map();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
  }

  // ========================================================================
  // Core Logging Methods
  // ========================================================================

  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return; // Skip logs below minimum level
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: category || this.config.defaultCategory,
      message,
      data,
      metadata: {
        env: process.env.NODE_ENV,
        version: process.env.npm_package_version,
      },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.bufferLog(entry);
    this.outputLog(entry);
  }

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  error(category: string, message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, category, message, data, error);
  }

  critical(category: string, message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.CRITICAL, category, message, data, error);
  }

  // ========================================================================
  // Context Management
  // ========================================================================

  setRequestContext(
    requestId: string,
    context: Partial<LogEntry>,
  ): void {
    this.requestContext.set(requestId, context);
  }

  getRequestContext(requestId: string): Partial<LogEntry> | undefined {
    return this.requestContext.get(requestId);
  }

  clearRequestContext(requestId: string): void {
    this.requestContext.delete(requestId);
  }

  // ========================================================================
  // Buffering
  // ========================================================================

  private bufferLog(entry: LogEntry): void {
    this.logBuffer.push(entry);

    if (this.logBuffer.length >= this.bufferSize) {
      this.flushBuffer();
    }
  }

  flushBuffer(): void {
    if (this.logBuffer.length === 0) return;

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    if (this.config.enableRemote) {
      this.sendToRemote(logsToFlush);
    }
  }

  // ========================================================================
  // Output Methods
  // ========================================================================

  private outputLog(entry: LogEntry): void {
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    if (this.config.enableFile) {
      this.outputToFile(entry);
    }
  }

  private outputToConsole(entry: LogEntry): void {
    const formatted = this.formatLogEntry(entry);
    const consoleLevel = this.getConsoleLogLevel(entry.level);

    console[consoleLevel](formatted);
  }

  private outputToFile(_entry: LogEntry): void {
    // Reserved for a real file / log shipper — never duplicate console in serverless.
  }

  private sendToRemote(entries: LogEntry[]): void {
    if (process.env.LOGGING_ENDPOINT) {
      // Send to remote logging service
      fetchWithTimeout(process.env.LOGGING_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: entries }),
      })
        .then(() => void 0)
        .catch((err) => {
          console.error('[LOGGER] Failed to send logs to remote:', err instanceof Error ? err.message : String(err))
        })
    }
  }

  // ========================================================================
  // Formatting
  // ========================================================================

  private formatLogEntry(entry: LogEntry): string {
    const parts: string[] = [
      `[${entry.timestamp}]`,
      `[${entry.level}]`,
      `[${entry.category}]`,
      entry.message,
    ];

    if (entry.requestId) {
      parts.push(`(request: ${entry.requestId})`);
    }

    if (entry.data) {
      parts.push(this.formatData(entry.data));
    }

    if (entry.error) {
      parts.push(`\nError: ${entry.error.name}: ${entry.error.message}`);
    }

    return parts.join(' ');
  }

  private formatData(data: Record<string, unknown>): string {
    return `${JSON.stringify(data)}`;
  }

  private getConsoleLogLevel(level: LogLevel): 'log' | 'warn' | 'error' {
    switch (level) {
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        return 'error';
      case LogLevel.WARN:
        return 'warn';
      default:
        return 'log';
    }
  }

  // ========================================================================
  // Statistics
  // ========================================================================

  getStatistics(): {
    bufferSize: number;
    contextSize: number;
  } {
    return {
      bufferSize: this.logBuffer.length,
      contextSize: this.requestContext.size,
    };
  }

  clearAll(): void {
    this.logBuffer = [];
    this.requestContext.clear();
  }
}

// ============================================================================
// 5. GLOBAL LOGGER INSTANCE
// ============================================================================

let globalLogger: Logger | null = null;

export function initializeLogger(config?: Partial<LoggerConfig>): Logger {
  globalLogger = new Logger({ ...buildDefaultLoggerConfig(), ...config })
  return globalLogger
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(buildDefaultLoggerConfig())
  }
  return globalLogger
}

// ============================================================================
// 6. PERFORMANCE MONITORING
// ============================================================================

export class PerformanceMonitor {
  private startTime: number;
  private marks: Map<string, number> = new Map();
  private category: string;

  constructor(category: string) {
    this.category = category;
    this.startTime = Date.now();
  }

  mark(name: string): void {
    this.marks.set(name, Date.now() - this.startTime);
  }

  end(operationName: string): number {
    const duration = Date.now() - this.startTime;
    const logger = getLogger();

    const marksData: Record<string, number> = {};
    this.marks.forEach((time, name) => {
      marksData[name] = time;
    });

    logger.debug(this.category, `Operation completed: ${operationName}`, {
      duration,
      marks: marksData,
    });

    return duration;
  }

  getMarks(): Record<string, number> {
    const result: Record<string, number> = {};
    this.marks.forEach((time, name) => {
      result[name] = time;
    });
    return result;
  }
}

// ============================================================================
// 7. AUDIT LOGGING
// ============================================================================

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  resource: string;
  resourceId: string;
  userId?: string;
  clientId: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  result: 'SUCCESS' | 'FAILURE';
  reason?: string;
}

export class AuditLogger {
  private logger: Logger;

  constructor() {
    this.logger = getLogger();
  }

  logAction(
    action: string,
    resource: string,
    resourceId: string,
    clientId: string,
    userId?: string,
    changes?: Record<string, { before: unknown; after: unknown }>,
    result: 'SUCCESS' | 'FAILURE' = 'SUCCESS',
    reason?: string,
  ): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      resource,
      resourceId,
      userId,
      clientId,
      changes,
      result,
      reason,
    };

    this.logger.info('AUDIT', `${action} on ${resource}`, entry as unknown as Record<string, unknown>);
  }

  logTicketCreated(clientId: string, ticketId: string, userId?: string): void {
    this.logAction('CREATE', 'TICKET', ticketId, clientId, userId, undefined, 'SUCCESS');
  }

  logTicketUpdated(
    clientId: string,
    ticketId: string,
    changes: Record<string, { before: unknown; after: unknown }>,
    userId?: string,
  ): void {
    this.logAction('UPDATE', 'TICKET', ticketId, clientId, userId, changes, 'SUCCESS');
  }

  logTicketAssigned(clientId: string, ticketId: string, workerId: string, userId?: string): void {
    this.logAction(
      'ASSIGN',
      'TICKET',
      ticketId,
      clientId,
      userId,
      { assigned_to: { before: null, after: workerId } },
      'SUCCESS',
    );
  }

  logFailedOperation(
    action: string,
    resource: string,
    resourceId: string,
    clientId: string,
    reason: string,
    userId?: string,
  ): void {
    this.logAction(action, resource, resourceId, clientId, userId, undefined, 'FAILURE', reason);
  }
}

// ============================================================================
// 8. GLOBAL AUDIT LOGGER
// ============================================================================

let globalAuditLogger: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger();
  }
  return globalAuditLogger;
}
