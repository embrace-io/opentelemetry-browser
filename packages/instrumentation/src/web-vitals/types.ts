/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { ApplyCustomLogRecordDataFunction } from '#utils';

export type { ApplyCustomLogRecordDataFunction };

/**
 * WebVitalsInstrumentation Configuration
 */
export interface WebVitalsInstrumentationConfig extends InstrumentationConfig {
  /**
   * @experimental
   * When true, sets the log record body to the JSON-stringified
   * `web-vitals` attribution object for the metric.
   *
   * Note: `applyCustomLogRecordData` runs after the body is set.
   * If the hook assigns a new `body`, it will overwrite the attribution data.
   */
  includeRawAttribution?: boolean;

  /**
   * Hook to modify log records before they are emitted. Receives only the
   * `attributes` and `body` of the record.
   *
   * Errors are caught and reported through the diag logger, and the record is
   * still emitted with whatever the hook set before it threw. Async hooks are
   * not supported: changes made after the first `await` are lost.
   */
  applyCustomLogRecordData?: ApplyCustomLogRecordDataFunction;
}
