/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HrTime } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { hrTimeToMilliseconds } from '@opentelemetry/core';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';

export const COLORS = {
  debug: '#6b7280',
  info: '#0891b2',
  warn: '#d97706',
  error: '#dc2626',
  ok: '#16a34a',
} as const;

let clean: Console | undefined;

/**
 * The console of a hidden iframe. Wrappers such as ConsoleInstrumentation
 * patch only the page's console, so output here cannot become new telemetry.
 * Without a DOM (Web Workers), this is the global console.
 */
export function cleanConsole(): Console {
  if (typeof document === 'undefined') {
    return console;
  }
  if (!clean) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    // The iframe stays attached: a detached frame's console stops printing.
    document.documentElement.appendChild(iframe);
    clean = (iframe.contentWindow as Window & typeof globalThis).console;
  }
  return clean;
}

function colorForSeverity(severity = SeverityNumber.UNSPECIFIED): string {
  if (severity >= SeverityNumber.ERROR) {
    return COLORS.error;
  }
  if (severity >= SeverityNumber.WARN) {
    return COLORS.warn;
  }
  if (
    severity >= SeverityNumber.INFO ||
    severity === SeverityNumber.UNSPECIFIED
  ) {
    return COLORS.info;
  }
  return COLORS.debug;
}

function isoTime(time: HrTime): string {
  return new Date(hrTimeToMilliseconds(time)).toISOString();
}

function renderGroup(
  color: string,
  scope: string,
  label: string,
  message: string,
  detail: Record<string, unknown>,
  collapsed: boolean,
): void {
  const out = cleanConsole();
  // Values go in as %s arguments so a '%' in them is printed, not parsed.
  const args = [
    '%c %s · %s %c %s',
    `background:${color};color:#fff;border-radius:3px;padding:1px 4px`,
    scope,
    label,
    'color:inherit',
    message,
  ];
  if (collapsed) {
    out.groupCollapsed(...args);
  } else {
    out.group(...args);
  }
  out.dir(detail);
  out.groupEnd();
}

export function renderSpan(span: ReadableSpan, collapsed: boolean): void {
  const ctx = span.spanContext();
  const isError = span.status.code === SpanStatusCode.ERROR;
  const durationMs = Math.round(hrTimeToMilliseconds(span.duration));

  renderGroup(
    isError ? COLORS.error : COLORS.ok,
    span.instrumentationScope.name,
    isError ? 'SPAN ERR' : 'SPAN',
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

export function renderLog(log: ReadableLogRecord, collapsed: boolean): void {
  renderGroup(
    colorForSeverity(log.severityNumber),
    log.instrumentationScope.name,
    log.severityText || 'LOG',
    // Non-string bodies are shown in the group detail only.
    typeof log.body === 'string' ? log.body : '',
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
