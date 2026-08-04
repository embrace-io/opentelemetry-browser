/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DiagLogger } from '@opentelemetry/api';
import type { LogAttributes, Logger, LogRecord } from '@opentelemetry/api-logs';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';

/**
 * The parts of a log record an `applyCustomLogRecordData` hook may change.
 *
 * Everything else identifies the signal (`eventName`, `severityNumber`,
 * timestamps) or carries its correlation (`context`), and stays owned by the
 * instrumentation.
 */
export type CustomizableLogRecord = Pick<LogRecord, 'attributes' | 'body'>;

export type ApplyCustomLogRecordDataFunction = (
  logRecord: CustomizableLogRecord,
) => void;

const isLogAttributes = (value: unknown): value is LogAttributes =>
  typeof value === 'object' && value !== null;

const isThenable = (value: unknown): boolean =>
  typeof (value as { then?: unknown } | undefined)?.then === 'function';

/**
 * Runs the `applyCustomLogRecordData` hook, if configured, then emits the record.
 *
 * The hook gets a throwaway view rather than the record itself, so it cannot
 * change the signal's identity even from untyped JavaScript. Both the hook and
 * `emit` are contained: neither a user callback nor a broken `LogRecordProcessor`
 * may break the host page.
 */
export function emitLogRecord(
  logger: Logger,
  diag: DiagLogger,
  logRecord: LogRecord,
  applyCustomLogRecordData?: ApplyCustomLogRecordDataFunction,
): void {
  if (applyCustomLogRecordData) {
    const view: CustomizableLogRecord = {
      attributes: logRecord.attributes,
      body: logRecord.body,
    };

    safeExecuteInTheMiddle(
      () => applyCustomLogRecordData(view),
      (error, result) => {
        if (error) {
          diag.error('applyCustomLogRecordData hook failed', error);
        } else if (isThenable(result)) {
          diag.warn(
            'applyCustomLogRecordData returned a promise: async hooks are not supported and changes made after the first await are lost',
          );
        }
      },
      true,
    );

    // A hook that throws part-way keeps whatever it already set, so copy back
    // regardless of the outcome.
    if (isLogAttributes(view.attributes)) {
      logRecord.attributes = view.attributes;
    } else if (view.attributes !== logRecord.attributes) {
      diag.warn(
        'applyCustomLogRecordData set attributes to a non-object value: keeping the instrumentation attributes',
      );
    }
    logRecord.body = view.body;
  }

  safeExecuteInTheMiddle(
    () => logger.emit(logRecord),
    (error) => {
      if (error) {
        diag.error('failed to emit log record', error);
      }
    },
    true,
  );
}
