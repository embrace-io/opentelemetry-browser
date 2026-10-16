/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleSpanExporter } from './ConsoleSpanExporter.ts';
import { COLORS, cleanConsole } from './utils.ts';

function fakeSpan(overrides: Partial<ReadableSpan> = {}): ReadableSpan {
  return {
    name: 'checkout.submit',
    kind: SpanKind.INTERNAL,
    spanContext: () => ({ traceId: 'tid', spanId: 'sid', traceFlags: 1 }),
    parentSpanContext: { traceId: 'tid', spanId: 'psid', traceFlags: 1 },
    startTime: [1700000000, 0],
    endTime: [1700000000, 142000000],
    status: { code: SpanStatusCode.OK },
    attributes: { 'http.method': 'POST' },
    links: [],
    events: [],
    duration: [0, 142000000],
    ended: true,
    instrumentationScope: { name: 'user-action', version: '1.0.0' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    ...overrides,
  } as unknown as ReadableSpan;
}

describe('ConsoleSpanExporter', () => {
  let groupCollapsed: MockInstance;
  let group: MockInstance;
  let dir: MockInstance;
  let groupEnd: MockInstance;

  beforeEach(() => {
    const out = cleanConsole();
    groupCollapsed = vi
      .spyOn(out, 'groupCollapsed')
      .mockImplementation(() => {});
    group = vi.spyOn(out, 'group').mockImplementation(() => {});
    dir = vi.spyOn(out, 'dir').mockImplementation(() => {});
    groupEnd = vi.spyOn(out, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a span as a collapsed group with a green badge', () => {
    const callback = vi.fn();

    new ConsoleSpanExporter().export([fakeSpan()], callback);

    const [format, badgeStyle, scope, label, , message] =
      groupCollapsed.mock.calls[0] ?? [];
    expect(format).toBe('%c %s · %s %c %s');
    expect(badgeStyle).toContain(COLORS.ok);
    expect(scope).toBe('user-action');
    expect(label).toBe('SPAN');
    expect(message).toBe('checkout.submit  142ms');
    expect(dir).toHaveBeenCalledWith({
      traceId: 'tid',
      spanId: 'sid',
      parentSpanId: 'psid',
      name: 'checkout.submit',
      kind: SpanKind.INTERNAL,
      startTime: '2023-11-14T22:13:20.000Z',
      durationMs: 142,
      status: { code: SpanStatusCode.OK },
      attributes: { 'http.method': 'POST' },
      events: [],
      links: [],
    });
    expect(groupEnd).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('renders an ERROR span with a red SPAN ERR badge', () => {
    new ConsoleSpanExporter().export(
      [fakeSpan({ status: { code: SpanStatusCode.ERROR } })],
      vi.fn(),
    );

    const [, badgeStyle, , label] = groupCollapsed.mock.calls[0] ?? [];
    expect(badgeStyle).toContain(COLORS.error);
    expect(label).toBe('SPAN ERR');
  });

  it('uses console.group when collapsed is false', () => {
    new ConsoleSpanExporter({ collapsed: false }).export([fakeSpan()], vi.fn());

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('does not write to the page console', () => {
    const pageGroup = vi
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {});

    new ConsoleSpanExporter().export([fakeSpan()], vi.fn());

    expect(pageGroup).not.toHaveBeenCalled();
    expect(groupCollapsed).toHaveBeenCalledTimes(1);
  });

  it('renders a span from a real TracerProvider', async () => {
    const provider = new TracerProvider({
      spanProcessors: [
        new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() }),
      ],
    });

    provider.getTracer('smoke-test').startSpan('work').end();
    await provider.forceFlush();

    const [, , scope, , , message] = groupCollapsed.mock.calls[0] ?? [];
    expect(scope).toBe('smoke-test');
    expect(message).toMatch(/^work {2}\d+ms$/);
  });
});
