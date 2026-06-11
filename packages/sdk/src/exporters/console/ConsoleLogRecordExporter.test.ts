/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HrTime } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
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
    const call = groupCollapsed.mock.calls[0];
    expect(call).toBeDefined();
    const header = call?.[0];
    const badgeStyle = call?.[1];
    expect(header).toContain('%c console · INFO %c');
    expect(header).toContain('user clicked button');
    expect(badgeStyle).toContain(BADGE_COLORS.info);

    const detail = dir.mock.calls[0]?.[0];
    expect(detail).toMatchObject({
      severityText: 'INFO',
      body: 'user clicked button',
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
    const call = groupCollapsed.mock.calls[0];
    expect(call?.[0]).toContain('console · ERROR');
    expect(call?.[1]).toContain(BADGE_COLORS.error);
  });

  it('derives a badge label from severity when severityText is absent', () => {
    const exporter = new ConsoleLogRecordExporter();
    exporter.export(
      [
        fakeLog({
          severityText: undefined,
          severityNumber: SeverityNumber.WARN,
        }),
      ],
      vi.fn(),
    );
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain('console · WARN');
  });

  it('uses console.group (not collapsed) when collapsed is false', () => {
    const exporter = new ConsoleLogRecordExporter({ collapsed: false });
    exporter.export([fakeLog()], vi.fn());

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('still reports SUCCESS and reports the error via diag when rendering throws', () => {
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeLog()], callback)).not.toThrow();
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    expect(diagError).toHaveBeenCalledTimes(1);
  });

  it('collapses when collapsed is explicitly true, same as unset', () => {
    const exporter = new ConsoleLogRecordExporter({ collapsed: true });
    exporter.export([fakeLog()], vi.fn());

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(group).not.toHaveBeenCalled();
  });

  it('snapshots the config so later mutation does not change behavior', () => {
    const config = { collapsed: false };
    const exporter = new ConsoleLogRecordExporter(config);
    config.collapsed = true;

    exporter.export([fakeLog()], vi.fn());

    expect(group).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('reports a render failure via console.error even when no diag logger is registered', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    groupCollapsed.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();
    const log = fakeLog();

    exporter.export([log], callback);

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toContain(log);
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
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeLog()], callback)).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('closes the group when console.dir throws so later output is not nested', () => {
    vi.spyOn(diag, 'error').mockImplementation(() => {});
    dir.mockImplementation(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    expect(() => exporter.export([fakeLog()], callback)).not.toThrow();
    expect(groupEnd).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('isolates a failing log record and still renders the rest of the batch', () => {
    const diagError = vi.spyOn(diag, 'error').mockImplementation(() => {});
    groupCollapsed.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    exporter.export([fakeLog(), fakeLog({ body: 'second message' })], callback);

    // First record threw and was reported; the second still rendered.
    expect(diagError).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).toHaveBeenCalledTimes(2);
    expect(groupCollapsed.mock.calls[1]?.[0]).toContain('second message');
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('does not throw and still reports SUCCESS on a circular body', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    expect(() =>
      exporter.export(
        [fakeLog({ body: circular as unknown as ReadableLogRecord['body'] })],
        callback,
      ),
    ).not.toThrow();
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain('[object Object]');
  });

  it('isolates a structurally malformed log record and still renders the rest of the batch', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const exporter = new ConsoleLogRecordExporter();
    const callback = vi.fn();

    exporter.export(
      [
        fakeLog({
          instrumentationScope:
            undefined as unknown as ReadableLogRecord['instrumentationScope'],
        }),
        fakeLog({ body: 'healthy message' }),
      ],
      callback,
    );

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(groupCollapsed.mock.calls[0]?.[0]).toContain('healthy message');
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('resolves shutdown and forceFlush', async () => {
    const exporter = new ConsoleLogRecordExporter();
    await expect(exporter.shutdown()).resolves.toBeUndefined();
    await expect(exporter.forceFlush()).resolves.toBeUndefined();
  });
});
