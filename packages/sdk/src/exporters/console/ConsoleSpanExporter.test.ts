/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HrTime } from '@opentelemetry/api';
import { diag, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
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
    const [header, badgeStyle] = groupCollapsed.mock.calls[0] ?? [];
    expect(header).toContain('%c user-action · SPAN %c');
    expect(header).toContain('checkout.submit');
    expect(header).toContain('142ms');
    expect(badgeStyle).toContain(BADGE_COLORS.ok);

    expect(dir).toHaveBeenCalledTimes(1);
    const detail = dir.mock.calls[0]?.[0];
    expect(detail).toMatchObject({
      traceId: 'tid',
      spanId: 'sid',
      parentSpanId: 'psid',
      name: 'checkout.submit',
      durationMs: 142,
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

    const [header, badgeStyle] = groupCollapsed.mock.calls[0] ?? [];
    expect(header).toContain('user-action · SPAN ERR');
    expect(badgeStyle).toContain(BADGE_COLORS.error);
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

  it('snapshots the config so later mutation does not change behavior', () => {
    const config = { collapsed: false };
    const exporter = new ConsoleSpanExporter(config);
    config.collapsed = true;

    exporter.export([fakeSpan()], vi.fn());

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('does not throw and still reports SUCCESS on a circular attribute value', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    expect(() =>
      exporter.export(
        [
          fakeSpan({
            attributes: circular as unknown as ReadableSpan['attributes'],
          }),
        ],
        callback,
      ),
    ).not.toThrow();
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('isolates a structurally malformed span and still renders the rest of the batch', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    exporter.export(
      [
        fakeSpan({ status: undefined as unknown as ReadableSpan['status'] }),
        fakeSpan({ name: 'healthy.span' }),
      ],
      callback,
    );

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain('healthy.span');
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('resolves shutdown and forceFlush', async () => {
    const exporter = new ConsoleSpanExporter();
    await expect(exporter.shutdown()).resolves.toBeUndefined();
    await expect(exporter.forceFlush()).resolves.toBeUndefined();
  });

  it('still reports SUCCESS and reports the error via diag when rendering throws', () => {
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeSpan()], callback)).not.toThrow();
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
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
    const callback = vi.fn();
    const span = fakeSpan();

    exporter.export([span], callback);

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContain(span);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('still invokes the callback when the registered diag logger throws', () => {
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
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('closes the group when console.dir throws so later output is not nested', () => {
    vi.spyOn(diag, 'error').mockImplementation(() => {});
    dir.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeSpan()], callback)).not.toThrow();
    expect(groupEnd).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('isolates a failing span and still renders the rest of the batch', () => {
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleSpanExporter();
    const callback = vi.fn();

    exporter.export([fakeSpan(), fakeSpan({ name: 'second.span' })], callback);

    // First span threw and was reported; the second still rendered.
    expect(diagError).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).toHaveBeenCalledTimes(2);
    expect(groupCollapsed.mock.calls[1]?.[0]).toContain('second.span');
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });
});
