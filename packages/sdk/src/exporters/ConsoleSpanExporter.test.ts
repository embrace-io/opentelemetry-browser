/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HrTime } from '@opentelemetry/api';
import {
  context,
  diag,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleSpanExporter } from './ConsoleSpanExporter.ts';
import { BADGE_COLORS } from './utils.ts';

function fakeSpan(overrides: Partial<ReadableSpan> = {}): ReadableSpan {
  const startTime: HrTime = [1700000000, 0];
  return {
    name: 'checkout.submit',
    kind: SpanKind.INTERNAL,
    spanContext: () => ({
      traceId: 'tid',
      spanId: 'sid',
      traceFlags: 1,
    }),
    parentSpanContext: { traceId: 'tid', spanId: 'psid', traceFlags: 1 },
    startTime,
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

function headerOf(call: unknown[] | undefined) {
  const [format, badgeStyle, scope, label, resetStyle, message] = call ?? [];
  return { format, badgeStyle, scope, label, resetStyle, message };
}

const FAILED = {
  code: ExportResultCode.FAILED,
  error: expect.any(Error),
};

describe('ConsoleSpanExporter', () => {
  let groupCollapsed: MockInstance;
  let group: MockInstance;
  let dir: MockInstance;
  let groupEnd: MockInstance;

  beforeEach(() => {
    groupCollapsed = vi
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {});
    group = vi.spyOn(console, 'group').mockImplementation(() => {});
    dir = vi.spyOn(console, 'dir').mockImplementation(() => {});
    groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an OK span as a collapsed group with a green badge', () => {
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    exporter.export([fakeSpan()], callback);

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    const header = headerOf(groupCollapsed.mock.calls[0]);
    expect(header.format).toBe('%c %s · %s %c %s');
    expect(header.badgeStyle).toContain(BADGE_COLORS.ok);
    expect(header.scope).toBe('user-action');
    expect(header.label).toBe('SPAN');
    expect(header.resetStyle).toContain('color:inherit');
    expect(header.message).toBe('checkout.submit  142ms');

    expect(dir).toHaveBeenCalledTimes(1);
    expect(dir.mock.calls[0]?.[0]).toEqual({
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

  it('renders an ERROR span with a red "SPAN ERR" badge', () => {
    const exporter = new ConsoleSpanExporter();
    exporter.export(
      [fakeSpan({ status: { code: SpanStatusCode.ERROR } })],
      vi.fn(),
    );

    const header = headerOf(groupCollapsed.mock.calls[0]);
    expect(header.label).toBe('SPAN ERR');
    expect(header.badgeStyle).toContain(BADGE_COLORS.error);
  });

  it('passes a "%" in the scope name as a value, not as part of the format', () => {
    const exporter = new ConsoleSpanExporter();
    exporter.export(
      [fakeSpan({ instrumentationScope: { name: 'scope %c %s' } })],
      vi.fn(),
    );

    const header = headerOf(groupCollapsed.mock.calls[0]);
    expect(header.format).toBe('%c %s · %s %c %s');
    expect(header.scope).toBe('scope %c %s');
  });

  it('rounds the duration to whole milliseconds', () => {
    const exporter = new ConsoleSpanExporter();
    exporter.export([fakeSpan({ duration: [0, 142_500_000] })], vi.fn());

    expect(headerOf(groupCollapsed.mock.calls[0]).message).toBe(
      'checkout.submit  143ms',
    );
  });

  it('renders a span with an invalid start time instead of dropping it', () => {
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    exporter.export([fakeSpan({ startTime: [Number.NaN, 0] })], callback);

    expect(dir.mock.calls[0]?.[0]).toMatchObject({ startTime: 'invalid time' });
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('uses console.group (not collapsed) when collapsed is false', () => {
    const exporter = new ConsoleSpanExporter({ collapsed: false });
    exporter.export([fakeSpan()], vi.fn());

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('collapses when collapsed is explicitly true, same as unset', () => {
    const exporter = new ConsoleSpanExporter({ collapsed: true });
    exporter.export([fakeSpan()], vi.fn());

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(group).not.toHaveBeenCalled();
  });

  it('reads the config once so later mutation does not change behavior', () => {
    const config = { collapsed: false };
    const exporter = new ConsoleSpanExporter(config);
    config.collapsed = true;

    exporter.export([fakeSpan()], vi.fn());

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('passes a circular attribute value to console.dir unchanged', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    exporter.export(
      [
        fakeSpan({
          attributes: circular as unknown as ReadableSpan['attributes'],
        }),
      ],
      callback,
    );

    expect(dir.mock.calls[0]?.[0].attributes).toBe(circular);
    expect(consoleError).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('isolates a structurally malformed span, renders the rest, and reports FAILED', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();
    const malformed = fakeSpan({
      status: undefined as unknown as ReadableSpan['status'],
    });

    exporter.export([malformed, fakeSpan({ name: 'healthy.span' })], callback);

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContain(malformed);
    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(headerOf(groupCollapsed.mock.calls[0]).message).toContain(
      'healthy.span',
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
    expect(callback.mock.calls[0]?.[0].error.message).toBe(
      'ConsoleSpanExporter failed to render 1 of 2 spans',
    );
  });

  it('reports FAILED and the error via diag when rendering throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeSpan()], callback)).not.toThrow();
    expect(callback).toHaveBeenCalledWith(FAILED);
    expect(diagError).toHaveBeenCalledTimes(1);
  });

  it('reports a render failure via console.error even when no diag logger is registered', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const span = fakeSpan();

    exporter.export([span], vi.fn());

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContain(span);
  });

  it('still invokes the callback once when the registered diag logger throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(diag, 'error').mockImplementation(() => {
      throw new Error('diag logger is broken');
    });
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeSpan()], callback)).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('still reports via diag when console.error throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('console is broken');
    });
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeSpan()], callback)).not.toThrow();
    expect(diagError).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('closes the group when console.dir throws so later output is not nested', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dir.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeSpan()], callback)).not.toThrow();
    expect(groupEnd).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('isolates a failing span and still renders the rest of the batch', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    exporter.export([fakeSpan(), fakeSpan({ name: 'second.span' })], callback);

    expect(diagError).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).toHaveBeenCalledTimes(2);
    expect(headerOf(groupCollapsed.mock.calls[1]).message).toContain(
      'second.span',
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('reports SUCCESS exactly once for an empty batch', () => {
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    exporter.export([], callback);

    expect(groupCollapsed).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('renders a root span without a parent span id', () => {
    const exporter = new ConsoleSpanExporter();

    exporter.export([fakeSpan({ parentSpanContext: undefined })], vi.fn());

    expect(dir).toHaveBeenCalledTimes(1);
    expect(dir.mock.calls[0]?.[0]).toMatchObject({
      parentSpanId: undefined,
      name: 'checkout.submit',
    });
  });

  it('resolves shutdown and forceFlush', async () => {
    const exporter = new ConsoleSpanExporter();
    await expect(exporter.shutdown()).resolves.toBeUndefined();
    await expect(exporter.forceFlush()).resolves.toBeUndefined();
  });

  it('prints nothing and reports FAILED after shutdown', async () => {
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    await exporter.shutdown();
    exporter.export([fakeSpan()], callback);

    expect(groupCollapsed).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('renders a span produced by a real TracerProvider', async () => {
    const provider = new TracerProvider({
      spanProcessors: [
        new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() }),
      ],
    });
    const tracer = provider.getTracer('smoke-test');

    const parentSpan = tracer.startSpan('parent');
    tracer
      .startSpan('child', {}, trace.setSpan(context.active(), parentSpan))
      .end();
    parentSpan.end();
    await provider.forceFlush();

    expect(groupCollapsed).toHaveBeenCalledTimes(2);
    expect(headerOf(groupCollapsed.mock.calls[0]).scope).toBe('smoke-test');
    const child = dir.mock.calls[0]?.[0];
    const parent = dir.mock.calls[1]?.[0];
    expect(child.name).toBe('child');
    expect(child.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(child.parentSpanId).toBe(parent.spanId);
    await provider.shutdown();
  });
});
