/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Visual category a signal's console badge is rendered as. */
export type BadgeLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'ok';

/** Options shared by both browser console exporters. */
export interface ConsoleExporterConfig {
  /**
   * Controls whether each signal's group starts collapsed. Only an explicit
   * `false` expands the group via `console.group`; `true` or unset uses
   * `console.groupCollapsed`.
   */
  readonly collapsed?: boolean;
}
