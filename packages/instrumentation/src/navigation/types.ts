/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import type { ApplyCustomLogRecordDataFunction } from '#utils';

export type { ApplyCustomLogRecordDataFunction };

export type SanitizeUrlFunction = (url: string) => string;

export type NavigationType = 'push' | 'replace' | 'reload' | 'traverse';

/**
 * NavigationInstrumentation Configuration
 */
export interface NavigationInstrumentationConfig extends InstrumentationConfig {
  /**
   * Hook to modify log records before they are emitted. Receives only the
   * `attributes` and `body` of the record.
   *
   * Errors are caught and reported through the diag logger, and the record is
   * still emitted with whatever the hook set before it threw. Async hooks are
   * not supported: changes made after the first `await` are lost.
   */
  applyCustomLogRecordData?: ApplyCustomLogRecordDataFunction;
  /** Use the Navigation API `currententrychange` event if available (experimental). Defaults to false. */
  useNavigationApiIfAvailable?: boolean;
  /** Custom function to sanitize URLs before adding to log records. */
  sanitizeUrl?: SanitizeUrlFunction;
}
