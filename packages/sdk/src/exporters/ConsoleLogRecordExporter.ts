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
import { exportBatch, renderLog } from './utils.ts';

/**
 * A LogRecordExporter that prints each log record to the browser console as a
 * styled, collapsible group with a severity badge.
 *
 * A record that fails to render is reported with `console.error` and
 * `diag.error`, and the rest of the batch still renders. The batch result is
 * then FAILED.
 */
export class ConsoleLogRecordExporter implements LogRecordExporter {
  private readonly _collapsed: boolean;
  private _isShutdown = false;

  /**
   * @param config Options for the console output. They are read once, so
   * later changes to the object have no effect.
   */
  constructor(config: ConsoleExporterConfig = {}) {
    this._collapsed = config.collapsed !== false;
  }

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (this._isShutdown) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error('ConsoleLogRecordExporter is shut down'),
      });
      return;
    }
    exportBatch(
      logs,
      (log) => renderLog(log, this._collapsed),
      'ConsoleLogRecordExporter',
      'log record',
      resultCallback,
    );
  }

  shutdown(): Promise<void> {
    this._isShutdown = true;
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
