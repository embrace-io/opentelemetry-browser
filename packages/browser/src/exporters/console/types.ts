/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Visual level a signal is rendered as. */
export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'ok';

/** Options shared by both browser console exporters. */
export interface ConsoleExporterConfig {
  /**
   * Render each signal with `console.groupCollapsed` (true, the default) so
   * groups start collapsed, or `console.group` (false) so they start expanded.
   */
  collapsed?: boolean;

  /** Override the badge background color for one or more levels. */
  colors?: Partial<Record<Level, string>>;
}
