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

/**
 * A LogRecordExporter that prints each log record to the browser console as
 * a group with a colored severity badge.
 */
export class ConsoleLogRecordExporter implements LogRecordExporter {
  private readonly _collapsed: boolean;

  constructor(config: ConsoleExporterConfig = {}) {
    this._collapsed = config.collapsed ?? true;
  }

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const log of logs) {
      renderLog(log, this._collapsed);
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
