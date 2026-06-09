/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Visual level a signal is rendered as. */
export type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'ok';

/** Options shared by both browser console exporters. */
export interface ConsoleExporterConfig {
  /**
   * Controls whether each signal's group starts collapsed. Defaults to
   * collapsed when unset. Only an explicit `false` expands the group via
   * `console.group`; any other value (including `true` or `undefined`) uses
   * `console.groupCollapsed`.
   */
  collapsed?: boolean;

  /** Override the badge background (a CSS color) for one or more levels. */
  colors?: Partial<Record<Level, string>>;
}
