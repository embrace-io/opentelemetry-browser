/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SeverityNumber } from '@opentelemetry/api-logs';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogRecordExporter } from './ConsoleLogRecordExporter.ts';
import { COLORS, cleanConsole } from './utils.ts';

function fakeLog(
  overrides: Partial<ReadableLogRecord> = {},
): ReadableLogRecord {
  return {
    hrTime: [1700000000, 0],
    hrTimeObserved: [1700000000, 0],
    spanContext: { traceId: 'tid', spanId: 'sid', traceFlags: 1 },
    severityText: 'INFO',
    severityNumber: SeverityNumber.INFO,
    body: 'user clicked button',
    resource: {},
    instrumentationScope: { name: 'console', version: '1.0.0' },
    attributes: { 'console.method': 'log' },
    droppedAttributesCount: 0,
    ...overrides,
  } as unknown as ReadableLogRecord;
}

describe('ConsoleLogRecordExporter', () => {
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

  it('renders a log record as a collapsed group with its body', () => {
    const callback = vi.fn();

    new ConsoleLogRecordExporter().export([fakeLog()], callback);

    const [format, badgeStyle, scope, label, , message] =
      groupCollapsed.mock.calls[0] ?? [];
    expect(format).toBe('%c %s · %s %c %s');
    expect(badgeStyle).toContain(COLORS.info);
    expect(scope).toBe('console');
    expect(label).toBe('INFO');
    expect(message).toBe('user clicked button');
    expect(dir).toHaveBeenCalledWith({
      severityText: 'INFO',
      severityNumber: SeverityNumber.INFO,
      body: 'user clicked button',
      timestamp: '2023-11-14T22:13:20.000Z',
      attributes: { 'console.method': 'log' },
      traceId: 'tid',
      spanId: 'sid',
    });
    expect(groupEnd).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it.each([
    [undefined, COLORS.info],
    [SeverityNumber.DEBUG, COLORS.debug],
    [SeverityNumber.INFO, COLORS.info],
    [SeverityNumber.WARN, COLORS.warn],
    [SeverityNumber.ERROR, COLORS.error],
    [SeverityNumber.FATAL, COLORS.error],
  ])('colors severity %s as %s', (severityNumber, color) => {
    new ConsoleLogRecordExporter().export(
      [fakeLog({ severityNumber })],
      vi.fn(),
    );

    expect(groupCollapsed.mock.calls[0]?.[1]).toContain(color);
  });

  it('keeps a non-string body out of the header', () => {
    const body = { cart: 3 };

    new ConsoleLogRecordExporter().export([fakeLog({ body })], vi.fn());

    expect(groupCollapsed.mock.calls[0]?.[5]).toBe('');
    expect(dir.mock.calls[0]?.[0]).toMatchObject({ body });
  });

  it('uses console.group when collapsed is false', () => {
    new ConsoleLogRecordExporter({ collapsed: false }).export(
      [fakeLog()],
      vi.fn(),
    );

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('does not feed its output back through a patched page console', async () => {
    const provider = new LoggerProvider({
      processors: [
        new SimpleLogRecordProcessor({
          exporter: new ConsoleLogRecordExporter(),
        }),
      ],
    });
    const logger = provider.getLogger('test');
    // Stands in for ConsoleInstrumentation: every page console call emits a record.
    for (const method of ['groupCollapsed', 'dir', 'log'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logger.emit({ body: String(args[0]) });
      });
    }

    logger.emit({ body: 'first' });
    await provider.forceFlush();

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
  });
});
