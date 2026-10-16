/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Options shared by both browser console exporters. */
export interface ConsoleExporterConfig {
  /**
   * Controls whether each signal's group starts collapsed. Only an explicit
   * `false` expands the group via `console.group`; `true` or unset uses
   * `console.groupCollapsed`.
   */
  readonly collapsed?: boolean;
}
