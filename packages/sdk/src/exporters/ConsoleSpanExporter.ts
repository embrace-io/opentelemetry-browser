/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';
import type { ConsoleExporterConfig } from './types.ts';
import { exportBatch, renderSpan } from './utils.ts';

/**
 * A SpanExporter that prints each span to the browser console as a styled,
 * collapsible group with a status badge and its duration.
 *
 * A span that fails to render is reported with `console.error` and
 * `diag.error`, and the rest of the batch still renders. The batch result is
 * then FAILED.
 */
export class ConsoleSpanExporter implements SpanExporter {
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
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (this._isShutdown) {
      resultCallback({
        code: ExportResultCode.FAILED,
        error: new Error('ConsoleSpanExporter is shut down'),
      });
      return;
    }
    exportBatch(
      spans,
      (span) => renderSpan(span, this._collapsed),
      'ConsoleSpanExporter',
      'span',
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
