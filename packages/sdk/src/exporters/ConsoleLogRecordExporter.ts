/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import type { ConsoleExporterConfig } from './types.ts';
import { renderLog, reportRenderFailure } from './utils.ts';

/**
 * A LogRecordExporter that prints each log record to the browser console as a
 * styled, collapsible group with a severity badge.
 *
 * A record that fails to render is reported with `console.error` and
 * `diag.error`, and the rest of the batch still renders.
 */
export class ConsoleLogRecordExporter implements LogRecordExporter {
  private readonly _config: ConsoleExporterConfig;

  /**
   * @param config Options for the console output. The object is copied, so
   * later changes to it have no effect.
   */
  constructor(config: ConsoleExporterConfig = {}) {
    this._config = { ...config };
  }

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const log of logs) {
      try {
        renderLog(log, this._config);
      } catch (err) {
        reportRenderFailure(
          'ConsoleLogRecordExporter failed to render a log record',
          log,
          err,
        );
      }
    }
    // A render failure is cosmetic. FAILED would only raise a spurious error
    // through the global error handler, because processors never retry a batch.
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
