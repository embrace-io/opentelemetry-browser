/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HrTime } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
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
import { BADGE_COLORS } from './utils.ts';

function fakeLog(
  overrides: Partial<ReadableLogRecord> = {},
): ReadableLogRecord {
  const hrTime: HrTime = [1700000000, 0];
  return {
    hrTime,
    hrTimeObserved: hrTime,
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

function headerOf(call: unknown[] | undefined) {
  const [format, badgeStyle, scope, label, resetStyle, message] = call ?? [];
  return { format, badgeStyle, scope, label, resetStyle, message };
}

const FAILED = {
  code: ExportResultCode.FAILED,
  error: expect.any(Error),
};

describe('ConsoleLogRecordExporter', () => {
  let group: MockInstance;
  let groupCollapsed: MockInstance;
  let dir: MockInstance;
  let groupEnd: MockInstance;

  beforeEach(() => {
    group = vi.spyOn(console, 'group').mockImplementation(() => {});
    groupCollapsed = vi
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {});
    dir = vi.spyOn(console, 'dir').mockImplementation(() => {});
    groupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an INFO log with a cyan badge and structured detail', () => {
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    exporter.export([fakeLog()], callback);

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    const header = headerOf(groupCollapsed.mock.calls[0]);
    expect(header.format).toBe('%c %s · %s %c %s');
    expect(header.badgeStyle).toContain(BADGE_COLORS.info);
    expect(header.scope).toBe('console');
    expect(header.label).toBe('INFO');
    expect(header.message).toBe('user clicked button');

    expect(dir.mock.calls[0]?.[0]).toEqual({
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

  it('colors an ERROR log red', () => {
    const exporter = new ConsoleLogRecordExporter();
    exporter.export(
      [
        fakeLog({
          severityNumber: SeverityNumber.ERROR,
          severityText: 'ERROR',
        }),
      ],
      vi.fn(),
    );
    const header = headerOf(groupCollapsed.mock.calls[0]);
    expect(header.label).toBe('ERROR');
    expect(header.badgeStyle).toContain(BADGE_COLORS.error);
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
  ])(
    'derives a badge label from severity when severityText is %s',
    (_, severityText) => {
      const exporter = new ConsoleLogRecordExporter();
      exporter.export(
        [fakeLog({ severityText, severityNumber: SeverityNumber.WARN })],
        vi.fn(),
      );
      expect(headerOf(groupCollapsed.mock.calls[0]).label).toBe('WARN');
    },
  );

  it('passes a "%" in severityText as a value, not as part of the format', () => {
    const exporter = new ConsoleLogRecordExporter();
    exporter.export([fakeLog({ severityText: '%c%s' })], vi.fn());

    const header = headerOf(groupCollapsed.mock.calls[0]);
    expect(header.format).toBe('%c %s · %s %c %s');
    expect(header.label).toBe('%c%s');
  });

  it('shows an Error body as "name: message" in the header', () => {
    const exporter = new ConsoleLogRecordExporter();
    const body = new TypeError('bad input');
    exporter.export(
      [fakeLog({ body: body as unknown as ReadableLogRecord['body'] })],
      vi.fn(),
    );

    expect(headerOf(groupCollapsed.mock.calls[0]).message).toBe(
      'TypeError: bad input',
    );
    expect(dir.mock.calls[0]?.[0].body).toBe(body);
  });

  it('renders a record with an invalid timestamp instead of dropping it', () => {
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    exporter.export([fakeLog({ hrTime: [Number.NaN, 0] })], callback);

    expect(dir.mock.calls[0]?.[0]).toMatchObject({ timestamp: 'invalid time' });
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('renders a record without a span context', () => {
    const exporter = new ConsoleLogRecordExporter();
    exporter.export([fakeLog({ spanContext: undefined })], vi.fn());

    expect(dir.mock.calls[0]?.[0]).toMatchObject({
      traceId: undefined,
      spanId: undefined,
    });
  });

  it('uses console.group (not collapsed) when collapsed is false', () => {
    const exporter = new ConsoleLogRecordExporter({ collapsed: false });
    exporter.export([fakeLog()], vi.fn());

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('collapses when collapsed is explicitly true, same as unset', () => {
    const exporter = new ConsoleLogRecordExporter({ collapsed: true });
    exporter.export([fakeLog()], vi.fn());

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(group).not.toHaveBeenCalled();
  });

  it('reads the config once so later mutation does not change behavior', () => {
    const config = { collapsed: false };
    const exporter = new ConsoleLogRecordExporter(config);
    config.collapsed = true;

    exporter.export([fakeLog()], vi.fn());

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('reports FAILED and the error via diag when rendering throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeLog()], callback)).not.toThrow();
    expect(callback).toHaveBeenCalledWith(FAILED);
    expect(callback.mock.calls[0]?.[0].error.message).toBe(
      'ConsoleLogRecordExporter failed to render 1 of 1 log records',
    );
    expect(diagError).toHaveBeenCalledTimes(1);
  });

  it('reports a render failure via console.error even when no diag logger is registered', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const log = fakeLog();

    exporter.export([log], vi.fn());

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContain(log);
  });

  it('still invokes the callback once when the registered diag logger throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(diag, 'error').mockImplementation(() => {
      throw new Error('diag logger is broken');
    });
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeLog()], callback)).not.toThrow();
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
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeLog()], callback)).not.toThrow();
    expect(diagError).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('closes the group when console.dir throws so later output is not nested', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dir.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeLog()], callback)).not.toThrow();
    expect(groupEnd).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('isolates a failing log record and still renders the rest of the batch', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    exporter.export([fakeLog(), fakeLog({ body: 'second message' })], callback);

    expect(diagError).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).toHaveBeenCalledTimes(2);
    expect(headerOf(groupCollapsed.mock.calls[1]).message).toBe(
      'second message',
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('reports SUCCESS exactly once for an empty batch', () => {
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    exporter.export([], callback);

    expect(groupCollapsed).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('marks a circular body in the header and reports SUCCESS', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular['self'] = circular;
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    exporter.export(
      [fakeLog({ body: circular as unknown as ReadableLogRecord['body'] })],
      callback,
    );

    expect(headerOf(groupCollapsed.mock.calls[0]).message).toBe(
      '{"a":1,"self":"[Circular]"}',
    );
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('isolates a structurally malformed log record, renders the rest, and reports FAILED', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();
    const malformed = fakeLog({
      instrumentationScope:
        undefined as unknown as ReadableLogRecord['instrumentationScope'],
    });

    exporter.export(
      [malformed, fakeLog({ body: 'healthy message' })],
      callback,
    );

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContain(malformed);
    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(headerOf(groupCollapsed.mock.calls[0]).message).toBe(
      'healthy message',
    );
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('resolves shutdown and forceFlush', async () => {
    const exporter = new ConsoleLogRecordExporter();
    await expect(exporter.shutdown()).resolves.toBeUndefined();
    await expect(exporter.forceFlush()).resolves.toBeUndefined();
  });

  it('prints nothing and reports FAILED after shutdown', async () => {
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    await exporter.shutdown();
    exporter.export([fakeLog()], callback);

    expect(groupCollapsed).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(FAILED);
  });

  it('renders a log record produced by a real LoggerProvider', async () => {
    const provider = new LoggerProvider({
      processors: [
        new SimpleLogRecordProcessor({
          exporter: new ConsoleLogRecordExporter(),
        }),
      ],
    });

    provider.getLogger('smoke-test').emit({
      body: 'hello',
      severityNumber: SeverityNumber.WARN,
      severityText: 'WARN',
      attributes: { 'app.key': 'value' },
    });
    await provider.forceFlush();

    const header = headerOf(groupCollapsed.mock.calls[0]);
    expect(header.scope).toBe('smoke-test');
    expect(header.label).toBe('WARN');
    expect(header.message).toBe('hello');
    expect(dir.mock.calls[0]?.[0]).toMatchObject({
      attributes: { 'app.key': 'value' },
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    await provider.shutdown();
  });

  it('does not recurse when a console wrapper turns its failure report into a new log record', async () => {
    const provider = new LoggerProvider({
      processors: [
        new SimpleLogRecordProcessor({
          exporter: new ConsoleLogRecordExporter(),
        }),
      ],
    });
    const logger = provider.getLogger('console');
    // Acts like ConsoleInstrumentation: each console.error call emits a record.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        logger.emit({ body: String(args[0]) });
      });
    dir.mockImplementation(() => {
      throw new Error('console.dir is broken');
    });

    logger.emit({ body: 'first' });
    await provider.forceFlush();

    expect(dir).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
    await provider.shutdown();
  });
});
