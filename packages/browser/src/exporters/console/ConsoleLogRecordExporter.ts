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
    this._config = config;
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
        // not fail silently either: surface the render error via diag and keep
        // rendering the rest of the batch.
        diag.error(
          'ConsoleLogRecordExporter failed to render a log record',
          err,
        );
      }
    }
    // Always report SUCCESS: a render failure is cosmetic, and reporting FAILED
    // would make the log processor treat the batch as dropped and retry it.
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
