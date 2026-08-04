/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { ApplyCustomLogRecordDataFunction } from '#utils';

export type { ApplyCustomLogRecordDataFunction };

/**
 * NavigationTimingInstrumentation Configuration
 */
export interface NavigationTimingInstrumentationConfig
  extends InstrumentationConfig {
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
