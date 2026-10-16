/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace';
import type { ConsoleExporterConfig } from './types.ts';
import { renderSpan } from './utils.ts';

/**
 * A SpanExporter that prints each span to the browser console as a group
 * with a colored status badge and its duration.
 */
export class ConsoleSpanExporter implements SpanExporter {
  private readonly _collapsed: boolean;

  constructor(config: ConsoleExporterConfig = {}) {
    this._collapsed = config.collapsed ?? true;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const span of spans) {
      renderSpan(span, this._collapsed);
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
