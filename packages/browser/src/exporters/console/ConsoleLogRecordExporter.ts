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
    try {
      for (const log of logs) {
        renderLog(log, this._config);
      }
    } catch {
      // A console exporter must never break the export pipeline.
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
