/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { diag } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { ConsoleExporterConfig } from './types.ts';
import { renderSpan } from './utils.ts';

/** A SpanExporter that prints styled, collapsible spans to the browser console. */
export class ConsoleSpanExporter implements SpanExporter {
  private readonly _config: ConsoleExporterConfig;

  constructor(config: ConsoleExporterConfig = {}) {
    this._config = config;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const span of spans) {
      try {
        renderSpan(span, this._config);
      } catch (err) {
        // A console exporter must never break the export pipeline, but it must
        // not fail silently either: surface the render error via diag and keep
        // rendering the rest of the batch.
        diag.error('ConsoleSpanExporter failed to render a span', err);
      }
    }
    // Always report SUCCESS: a render failure is cosmetic, and reporting FAILED
    // would make the span processor treat the batch as dropped and retry it.
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
