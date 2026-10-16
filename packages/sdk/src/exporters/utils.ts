/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HrTime } from '@opentelemetry/api';
import { diag, SpanStatusCode } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode, hrTimeToMilliseconds } from '@opentelemetry/core';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';

export type BadgeLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'ok';

export const BADGE_COLORS: Readonly<Record<BadgeLevel, string>> = {
  trace: '#6b7280',
  debug: '#6b7280',
  info: '#0891b2',
  warn: '#d97706',
  error: '#dc2626',
  ok: '#16a34a',
};

export const MAX_HEADER_BODY_LENGTH = 200;

/** A missing or UNSPECIFIED severity maps to 'info', and FATAL maps to 'error'. */
export function levelForSeverity(severity?: SeverityNumber): BadgeLevel {
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

/** UNSET and OK both map to 'ok'. */
export function levelForStatus(code: SpanStatusCode): BadgeLevel {
  return code === SpanStatusCode.ERROR ? 'error' : 'ok';
}

const HEADER_STYLE_RESET = 'color:inherit;font-weight:normal';

function badgeStyle(color: string): string {
  return `background:${color};color:#fff;border-radius:3px;padding:1px 4px;font-weight:600`;
}

function renderGroup(
  scope: string,
  level: BadgeLevel,
  badgeLabel: string,
  message: string,
  detail: Record<string, unknown>,
  collapsed: boolean,
): void {
  // Values go in as %s arguments so a '%' in them is printed, not parsed.
  const args = [
    '%c %s · %s %c %s',
    badgeStyle(BADGE_COLORS[level]),
    scope,
    badgeLabel,
    HEADER_STYLE_RESET,
    message,
  ];

  if (collapsed) {
    console.groupCollapsed(...args);
  } else {
    console.group(...args);
  }
  // Close the group even if rendering the detail throws, so the failure
  // cannot nest all later console output.
  try {
    console.dir(detail);
  } finally {
    console.groupEnd();
  }
}

function isoTime(time: HrTime): string {
  const date = new Date(hrTimeToMilliseconds(time));
  // toISOString throws on an invalid date, which would hide the whole item.
  return Number.isNaN(date.getTime()) ? 'invalid time' : date.toISOString();
}

export function renderSpan(span: ReadableSpan, collapsed: boolean): void {
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
      startTime: isoTime(span.startTime),
      durationMs,
      status: span.status,
      attributes: span.attributes,
      events: span.events,
      links: span.links,
    },
    collapsed,
  );
}

// Marks only true cycles. A value seen twice on different branches is still
// printed in full.
function jsonReplacer(): (
  this: unknown,
  key: string,
  value: unknown,
) => unknown {
  const ancestors: unknown[] = [];
  return function (this: unknown, _key: string, value: unknown): unknown {
    if (typeof value === 'bigint') {
      return `${value}n`;
    }
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    // `this` is the object that holds `value`. Pop the ancestors that are no
    // longer on the path from the root to it.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(value)) {
      return '[Circular]';
    }
    ancestors.push(value);
    return value;
  };
}

function serializeBody(body: unknown): string {
  try {
    return JSON.stringify(body, jsonReplacer()) ?? String(body);
  } catch {
    try {
      return String(body);
    } catch {
      // String() throws for a null-prototype object, which has no toString.
      return '[unserializable body]';
    }
  }
}

/**
 * Render a log body as a header string of at most
 * {@link MAX_HEADER_BODY_LENGTH} characters. The full body is still in the
 * group detail.
 */
export function stringifyBody(body: unknown): string {
  let text: string;
  if (typeof body === 'string') {
    text = body;
  } else if (body instanceof Error) {
    // JSON.stringify skips the non-enumerable name and message, which gives "{}".
    text = `${body.name}: ${body.message}`;
  } else {
    text = serializeBody(body);
  }
  return text.length > MAX_HEADER_BODY_LENGTH
    ? `${text.slice(0, MAX_HEADER_BODY_LENGTH)}…`
    : text;
}

export function renderLog(log: ReadableLogRecord, collapsed: boolean): void {
  const level = levelForSeverity(log.severityNumber);
  const badgeLabel = log.severityText || level.toUpperCase();

  renderGroup(
    log.instrumentationScope.name,
    level,
    badgeLabel,
    stringifyBody(log.body),
    {
      severityText: log.severityText,
      severityNumber: log.severityNumber,
      body: log.body,
      timestamp: isoTime(log.hrTime),
      attributes: log.attributes,
      traceId: log.spanContext?.traceId,
      spanId: log.spanContext?.spanId,
    },
    collapsed,
  );
}

// True while an exporter writes its own error output. A console wrapper such
// as ConsoleInstrumentation turns that output into new log records, and
// rendering them can fail the same way, which would recurse without end.
let reportingFailure = false;

function reportRenderFailure(
  message: string,
  item: unknown,
  err: unknown,
): void {
  reportingFailure = true;
  try {
    // diag is a no-op unless the app registered a logger, so also use the console.
    try {
      console.error(message, item, err);
    } catch {
      // The console, or a wrapper around it, threw. diag is the last channel.
    }
    try {
      diag.error(message, item, err);
    } catch {
      // A throwing DiagLogger must not break the export pipeline.
    }
  } finally {
    reportingFailure = false;
  }
}

/**
 * Render each item on its own, so one bad item does not stop the batch, and
 * call `resultCallback` exactly once.
 *
 * The result is FAILED when any item fails, because the spec defines Success
 * as "the batch has been successfully exported":
 * https://opentelemetry.io/docs/specs/otel/trace/sdk/#exportbatch
 */
export function exportBatch<T>(
  items: readonly T[],
  render: (item: T) => void,
  exporterName: string,
  itemName: string,
  resultCallback: (result: ExportResult) => void,
): void {
  if (reportingFailure) {
    // These items come from our own failure report, which is already in the
    // console. Rendering them would only repeat it.
    resultCallback({ code: ExportResultCode.SUCCESS });
    return;
  }

  let failed = 0;
  for (const item of items) {
    try {
      render(item);
    } catch (err) {
      failed++;
      reportRenderFailure(
        `${exporterName} failed to render a ${itemName}`,
        item,
        err,
      );
    }
  }

  if (failed === 0) {
    resultCallback({ code: ExportResultCode.SUCCESS });
    return;
  }
  // The error is required: the SDK processors count an export as failed in
  // their self-observability metrics only when `error` is set.
  const error = new Error(
    `${exporterName} failed to render ${failed} of ${items.length} ${itemName}s`,
  );
  reportingFailure = true;
  try {
    resultCallback({ code: ExportResultCode.FAILED, error });
  } finally {
    reportingFailure = false;
  }
}
