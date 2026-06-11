/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import type { ConsoleExporterConfig } from './types.ts';
import { renderLog } from './utils.ts';

/** A LogRecordExporter that prints styled, collapsible logs to the browser console. */
export class ConsoleLogRecordExporter implements LogRecordExporter {
  private readonly _config: ConsoleExporterConfig;

  constructor(config: ConsoleExporterConfig = {}) {
    // Snapshot so mutating the caller's object cannot change behavior later.
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
        // A console exporter must never break the export pipeline, but it must
        // not fail silently either: surface the render error and keep rendering
        // the rest of the batch. console.error is the primary surface (diag is
        // a no-op unless the app registered a logger), and both calls are
        // guarded so a broken console or diag logger cannot stop the loop.
        try {
          console.error(
            'ConsoleLogRecordExporter failed to render a log record',
            log,
            err,
          );
        } catch {
          // The console itself is broken; there is nowhere left to report.
        }
        try {
          diag.error(
            'ConsoleLogRecordExporter failed to render a log record',
            log,
            err,
          );
        } catch {
          // A throwing DiagLogger must not break the export pipeline.
        }
      }
    }
    // Always report SUCCESS: a render failure is cosmetic, and reporting FAILED
    // would only raise a spurious error through the SDK's global error handler
    // (log record processors never retry a batch).
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
