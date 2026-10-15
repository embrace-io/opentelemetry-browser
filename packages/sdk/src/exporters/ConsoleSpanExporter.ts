/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';
import type { ConsoleExporterConfig } from './types.ts';
import { renderSpan, reportRenderFailure } from './utils.ts';

/**
 * A SpanExporter that prints each span to the browser console as a styled,
 * collapsible group with a status badge and its duration.
 *
 * A span that fails to render is reported with `console.error` and
 * `diag.error`, and the rest of the batch still renders.
 */
export class ConsoleSpanExporter implements SpanExporter {
  private readonly _config: ConsoleExporterConfig;

  /**
   * @param config Options for the console output. The object is copied, so
   * later changes to it have no effect.
   */
  constructor(config: ConsoleExporterConfig = {}) {
    this._config = { ...config };
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const span of spans) {
      try {
        renderSpan(span, this._config);
      } catch (err) {
        reportRenderFailure(
          'ConsoleSpanExporter failed to render a span',
          span,
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
