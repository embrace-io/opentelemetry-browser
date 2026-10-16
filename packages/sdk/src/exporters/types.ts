/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Options shared by both browser console exporters. */
export interface ConsoleExporterConfig {
  /**
   * Start each group collapsed (`console.groupCollapsed`). Set to `false` to
   * use `console.group`.
   * @defaultValue true
   */
  collapsed?: boolean;
}
