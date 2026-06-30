import { Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { getRequestId } from './request-context';
import { redact } from './redaction';

const LEVEL_PRIORITY: Record<string, number> = { verbose: 0, debug: 1, log: 2, warn: 3, error: 4 };

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly minLevel: number;

  constructor() {
    const env = process.env['LOG_LEVEL'] ?? 'log';
    this.minLevel = LEVEL_PRIORITY[env] ?? LEVEL_PRIORITY['log']!;
  }

  log(message: unknown, context?: string): void {
    this.emit('log', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.emit('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.emit('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.emit('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.emit('verbose', message, context);
  }

  private emit(level: string, message: unknown, context?: string, stack?: string): void {
    if ((LEVEL_PRIORITY[level] ?? 0) < this.minLevel) return;
    const line: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      context,
      message,
      requestId: getRequestId(),
    };
    if (stack) line['stack'] = stack;
    process.stdout.write(JSON.stringify(redact(line)) + '\n');
  }
}
