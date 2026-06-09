/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ConsoleExporterConfig, Level } from './types.ts';

/** Default badge background colors per level. */
export const DEFAULT_COLORS: Record<Level, string> = {
  trace: '#6b7280',
  debug: '#6b7280',
  info: '#0891b2',
  warn: '#d97706',
  error: '#dc2626',
  ok: '#16a34a',
};

/** Map a log record's SeverityNumber to a visual level. */
export function levelForSeverity(severity?: SeverityNumber): Level {
  if (severity === undefined || severity <= SeverityNumber.UNSPECIFIED) {
    return 'info';
  }
  if (severity <= SeverityNumber.TRACE4) {
    return 'trace';
  }
  if (severity <= SeverityNumber.DEBUG4) {
    return 'debug';
  }
  if (severity <= SeverityNumber.INFO4) {
    return 'info';
  }
  if (severity <= SeverityNumber.WARN4) {
    return 'warn';
  }
  return 'error';
}

/** Map a span status code to a visual level. */
export function levelForStatus(code: SpanStatusCode): Level {
  return code === SpanStatusCode.ERROR ? 'error' : 'ok';
}

/** Resolve the badge color for a level, honoring per-level overrides. */
export function colorForLevel(
  level: Level,
  overrides?: Partial<Record<Level, string>>,
): string {
  return overrides?.[level] ?? DEFAULT_COLORS[level];
}

const HEADER_STYLE_RESET = 'color:inherit;font-weight:normal';

function badgeStyle(color: string): string {
  return `background:${color};color:#fff;border-radius:3px;padding:1px 4px;font-weight:600`;
}

/** Emit a collapsed (or expanded) console group with a styled badge header. */
function renderGroup(
  scope: string,
  level: Level,
  badgeLabel: string,
  message: string,
  detail: Record<string, unknown>,
  config: ConsoleExporterConfig,
): void {
  const color = colorForLevel(level, config.colors);
  const header = `%c ${scope} · ${badgeLabel} %c ${message}`;
  const styleArgs = [badgeStyle(color), HEADER_STYLE_RESET];

  if (config.collapsed === false) {
    console.group(header, ...styleArgs);
  } else {
    console.groupCollapsed(header, ...styleArgs);
  }
  console.dir(detail);
  console.groupEnd();
}

/** Render a single span as a styled console group. */
export function renderSpan(
  span: ReadableSpan,
  config: ConsoleExporterConfig,
): void {
  const ctx = span.spanContext();
  const level = levelForStatus(span.status.code);
  const badgeLabel = level === 'error' ? 'SPAN ERR' : 'SPAN';
  const durationMs = Math.round(hrTimeToMilliseconds(span.duration));

  renderGroup(
    span.instrumentationScope.name,
    level,
    badgeLabel,
    `${span.name}  ${durationMs}ms`,
    {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: span.parentSpanContext?.spanId,
      name: span.name,
      kind: span.kind,
      startTime: new Date(hrTimeToMilliseconds(span.startTime)).toISOString(),
      durationMs,
      status: span.status,
      attributes: span.attributes,
      events: span.events,
      links: span.links,
    },
    config,
  );
}

function stringifyBody(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }
  try {
    return JSON.stringify(body) ?? String(body);
  } catch {
    return String(body);
  }
}

/** Render a single log record as a styled console group. */
export function renderLog(
  log: ReadableLogRecord,
  config: ConsoleExporterConfig,
): void {
  const level = levelForSeverity(log.severityNumber);
  const badgeLabel = log.severityText ?? level.toUpperCase();

  renderGroup(
    log.instrumentationScope.name,
    level,
    badgeLabel,
    stringifyBody(log.body),
    {
      severityText: log.severityText,
      severityNumber: log.severityNumber,
      body: log.body,
      timestamp: new Date(hrTimeToMilliseconds(log.hrTime)).toISOString(),
      attributes: log.attributes,
      traceId: log.spanContext?.traceId,
      spanId: log.spanContext?.spanId,
    },
    config,
  );
}
