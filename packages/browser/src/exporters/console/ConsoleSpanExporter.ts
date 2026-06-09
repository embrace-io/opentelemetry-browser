/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

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
    try {
      for (const span of spans) {
        renderSpan(span, this._config);
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
