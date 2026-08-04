/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DiagLogger } from '@opentelemetry/api';
import type { Logger, LogRecord } from '@opentelemetry/api-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplyCustomLogRecordDataFunction } from './logRecord.ts';
import { emitLogRecord } from './logRecord.ts';

describe('emitLogRecord', () => {
  let logger: Logger;
  let diag: DiagLogger;
  let emit: ReturnType<typeof vi.fn>;

  const makeRecord = (): LogRecord => ({
    eventName: 'test.event',
    severityNumber: SeverityNumber.INFO,
    attributes: { 'test.attribute': 'original' },
  });

  const emittedRecord = () => emit.mock.calls[0]?.[0] as LogRecord;

  beforeEach(() => {
    emit = vi.fn();
    logger = { emit } as unknown as Logger;
    diag = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };
  });

  it('should emit the record unchanged when no hook is configured', () => {
    const logRecord = makeRecord();

    emitLogRecord(logger, diag, logRecord);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emittedRecord()).toBe(logRecord);
    expect(emittedRecord().attributes).toEqual({
      'test.attribute': 'original',
    });
    expect(diag.error).not.toHaveBeenCalled();
    expect(diag.warn).not.toHaveBeenCalled();
  });

  it('should apply attributes added in place by the hook', () => {
    const logRecord = makeRecord();

    emitLogRecord(logger, diag, logRecord, (record) => {
      (record.attributes as Record<string, unknown>)['custom.key'] = 'value';
    });

    expect(emittedRecord().attributes).toEqual({
      'test.attribute': 'original',
      'custom.key': 'value',
    });
  });

  it('should apply attributes replaced wholesale by the hook', () => {
    const logRecord = makeRecord();

    emitLogRecord(logger, diag, logRecord, (record) => {
      record.attributes = { ...record.attributes, 'custom.key': 'value' };
    });

    expect(emittedRecord().attributes).toEqual({
      'test.attribute': 'original',
      'custom.key': 'value',
    });
  });

  it('should apply a body set by the hook', () => {
    const logRecord = makeRecord();

    emitLogRecord(logger, diag, logRecord, (record) => {
      record.body = 'custom body';
    });

    expect(emittedRecord().body).toBe('custom body');
  });

  it('should ignore hook writes to fields the instrumentation owns', () => {
    const logRecord = makeRecord();

    // Untyped callers can still try; the hook only ever sees a throwaway view.
    emitLogRecord(logger, diag, logRecord, ((record: {
      eventName?: string;
      severityNumber?: SeverityNumber;
      timestamp?: number;
    }) => {
      record.eventName = 'hijacked.event';
      record.severityNumber = SeverityNumber.FATAL;
      record.timestamp = 1;
    }) as ApplyCustomLogRecordDataFunction);

    expect(emittedRecord().eventName).toBe('test.event');
    expect(emittedRecord().severityNumber).toBe(SeverityNumber.INFO);
    expect(emittedRecord().timestamp).toBeUndefined();
  });

  it('should keep the instrumentation attributes when the hook makes them unusable', () => {
    const logRecord = makeRecord();

    emitLogRecord(logger, diag, logRecord, ((record: {
      attributes?: unknown;
    }) => {
      record.attributes = null;
    }) as ApplyCustomLogRecordDataFunction);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emittedRecord().attributes).toEqual({
      'test.attribute': 'original',
    });
    expect(diag.warn).toHaveBeenCalledWith(
      expect.stringContaining('non-object value'),
    );
  });

  it('should report a throwing hook and still emit what it already set', () => {
    const logRecord = makeRecord();
    const error = new Error('hook boom');

    expect(() => {
      emitLogRecord(logger, diag, logRecord, (record) => {
        (record.attributes as Record<string, unknown>)['custom.key'] = 'value';
        throw error;
      });
    }).not.toThrow();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emittedRecord().attributes).toEqual({
      'test.attribute': 'original',
      'custom.key': 'value',
    });
    expect(diag.error).toHaveBeenCalledWith(
      'applyCustomLogRecordData hook failed',
      error,
    );
  });

  it('should warn that an async hook is not supported', async () => {
    const logRecord = makeRecord();
    let resolveHook: (() => void) | undefined;
    const hookFinished = new Promise<void>((resolve) => {
      resolveHook = resolve;
    });

    emitLogRecord(logger, diag, logRecord, (async (record: {
      attributes?: unknown;
    }) => {
      await Promise.resolve();
      record.attributes = { 'too.late': true };
      resolveHook?.();
    }) as unknown as ApplyCustomLogRecordDataFunction);

    expect(diag.warn).toHaveBeenCalledWith(
      expect.stringContaining('async hooks are not supported'),
    );

    await hookFinished;
    expect(emittedRecord().attributes).toEqual({
      'test.attribute': 'original',
    });
  });

  it('should report a failing emit instead of throwing', () => {
    const logRecord = makeRecord();
    const error = new Error('processor boom');
    emit.mockImplementation(() => {
      throw error;
    });

    expect(() => {
      emitLogRecord(logger, diag, logRecord);
    }).not.toThrow();

    expect(diag.error).toHaveBeenCalledWith('failed to emit log record', error);
  });
});
