/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
// Browser-specific entry. The package has no `exports` map for TS to resolve
// via a `browser` condition, and the public `@opentelemetry/instrumentation`
// types point at the Node variant (with its own `_enabled` field, `_modules`,
// etc.) which doesn't match what the bundler actually loads at runtime.
import { InstrumentationBase as CoreInstrumentationBase } from '@opentelemetry/instrumentation/build/esm/platform/browser/instrumentation.js';

/**
 * Browser instrumentation base. Wraps upstream `InstrumentationBase` to:
 *  - suppress its constructor-time `enable()` call, which fires before
 *    subclass class-field initializers and would clobber their state,
 *  - default to disabled (callers opt in with `{ enabled: true }`),
 *  - expose `_config.enabled` as the single source of truth via `isEnabled()`
 *    for external callers and the protected `_enabled` accessor for subclasses,
 *  - route enable/disable transitions through `setConfig` so callers can flip
 *    state plus update other config fields in a single call. If `enabled` is
 *    omitted from the new config the current state is preserved (the upstream
 *    `setConfig` would otherwise default it to `true` and surprise-enable).
 *
 * Subclasses implement `enable()` / `disable()` and flip state with
 * `this._enabled = true | false`.
 */
export abstract class InstrumentationBase<
  ConfigType extends InstrumentationConfig = InstrumentationConfig,
> extends CoreInstrumentationBase<ConfigType> {
  constructor(
    instrumentationName: string,
    instrumentationVersion: string,
    config: ConfigType,
  ) {
    super(instrumentationName, instrumentationVersion, {
      ...config,
      enabled: false,
    });
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  override setConfig(config: ConfigType): void {
    const wasEnabled = this._enabled;
    const targetEnabled =
      config.enabled === undefined ? wasEnabled : config.enabled === true;

    // Preserve the old enabled flag in the new config so the subclass's
    // enable()/disable() short-circuit guards see the previous state and
    // run their setup/teardown exactly once.
    this._config = { ...config, enabled: wasEnabled };

    if (targetEnabled && !wasEnabled) {
      this.enable();
    } else if (!targetEnabled && wasEnabled) {
      this.disable();
    }
  }

  protected get _enabled(): boolean {
    return this._config.enabled === true;
  }

  protected set _enabled(value: boolean) {
    this._config = { ...this._config, enabled: value };
  }

  protected override init() {
    return [];
  }
}
