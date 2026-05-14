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
 * Browser instrumentation base.
 *
 * Wraps upstream `InstrumentationBase` to:
 *  - Suppress its constructor-time `enable()` call, which fires before
 *    subclass class-field initializers and would clobber their state.
 *  - Default to disabled. Callers opt in via `{ enabled: true }` or by
 *    calling `.enable()` after construction.
 *  - Expose `_config.enabled` as the single source of truth via the public
 *    `isEnabled()` and the protected `_enabled` getter.
 *  - Route enable/disable through a template-method pattern: subclasses
 *    implement `_onEnable()` / `_onDisable()` (and may override `_canEnable()`
 *    to veto a transition, e.g. for unsupported browsers). The base owns the
 *    idempotency guard and the `_config.enabled` write, so the invariant
 *    "after enable() returns isEnabled() is true" cannot drift per subclass.
 *  - Wrap the hooks in a shared try/catch: if `_onEnable()` or `_onDisable()`
 *    throws, the base rolls `_config.enabled` back to its pre-call value (so
 *    `isEnabled()` remains accurate), logs a diagnostic, and rethrows. Side
 *    effects installed before the throw may still be live, so the instance
 *    should be reset or discarded by the caller.
 *  - Override `setConfig` so callers can flip state and update other config
 *    fields atomically. Omitting `enabled` from the new config preserves the
 *    current state (upstream's setConfig would otherwise default it to true
 *    and surprise-enable). When `enabled: true` is requested but `_canEnable()`
 *    vetoes, a warn-level diag log surfaces the silent veto.
 *
 * `enable()` and `disable()` are intentionally not `abstract` and should not
 * be overridden by subclasses. The template-method hooks below are the
 * extension points.
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

  /**
   * Public accessor. Reads from `_config.enabled` so it cannot drift from
   * what the lifecycle methods have actually applied.
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Returns a frozen snapshot of the current config. External callers cannot
   * mutate `_config.enabled` (or any other field) through the returned object,
   * which would otherwise let them silently invalidate the lifecycle invariant.
   * Subclasses inside this package read `this._config` directly when they need
   * the live reference.
   */
  override getConfig(): Readonly<ConfigType> {
    return Object.freeze({ ...this._config });
  }

  /**
   * Final. Do not override. Subclasses implement `_onEnable()` (and optionally
   * `_canEnable()`) for setup logic.
   */
  override enable(): void {
    if (this._enabled) {
      return;
    }
    if (!this._canEnable()) {
      return;
    }
    this._runTransition(true);
  }

  /**
   * Final. Do not override. Subclasses implement `_onDisable()` for teardown.
   */
  override disable(): void {
    if (!this._enabled) {
      return;
    }
    this._runTransition(false);
  }

  override setConfig(config: ConfigType): void {
    const wasEnabled = this._enabled;
    const targetEnabled = config.enabled ?? wasEnabled;

    // Preserve the old enabled flag in the new config so the base lifecycle
    // guards below still see the previous state when enable()/disable() runs.
    // Non-transition setConfig calls (off-off, on-on) leave _config.enabled
    // at the pre-call value and the other fields take effect immediately.
    this._config = { ...config, enabled: wasEnabled };

    if (targetEnabled && !wasEnabled) {
      this.enable();
      // _canEnable() may veto the transition; surface that explicitly here
      // because a caller who passed `enabled: true` will otherwise see a
      // clean return and have no idea the instance stayed disabled.
      if (!this._enabled) {
        this._diag.warn(
          'setConfig requested enable but _canEnable() vetoed; instance remains disabled',
        );
      }
    } else if (!targetEnabled && wasEnabled) {
      this.disable();
    }
  }

  /**
   * Runs the requested transition with a try/catch that logs a diagnostic
   * before rethrowing. On throw, `_config.enabled` is rolled back to the
   * pre-call state so `isEnabled()` remains accurate; the subclass-installed
   * side effects may still be partially applied, so the instance should be
   * treated as suspect and either reset or discarded by the caller.
   */
  private _runTransition(target: boolean): void {
    const previous = !target;
    this._config = { ...this._config, enabled: target };
    try {
      if (target) {
        this._onEnable();
      } else {
        this._onDisable();
      }
    } catch (err) {
      this._config = { ...this._config, enabled: previous };
      this._diag.error(
        `lifecycle transition (enabled: ${String(previous)} -> ${String(
          target,
        )}) threw. side effects may be partially applied`,
        err,
      );
      throw err;
    }
  }

  /**
   * Read-only protected accessor for subclasses to check the lifecycle flag
   * from inside handlers or patched methods. Writes are intentionally not
   * exposed; state transitions go through `enable()` / `disable()`.
   */
  protected get _enabled(): boolean {
    return this._config.enabled === true;
  }

  /**
   * Veto hook for `enable()`. Default returns true (always allowed).
   * Subclasses can override to short-circuit `enable()` when the runtime is
   * missing a required capability (e.g. PerformanceObserver). When this
   * returns false, the base does not flip `_enabled` and does not call
   * `_onEnable()`, so `isEnabled()` stays false and a subsequent `enable()`
   * call can try again (useful when capability detection is dynamic).
   */
  protected _canEnable(): boolean {
    return true;
  }

  /**
   * Required side-effect hook. Runs after the base flips `_enabled` to true.
   * Subclasses install listeners, patch globals, etc. here.
   */
  protected abstract _onEnable(): void;

  /**
   * Required teardown hook. Runs after the base flips `_enabled` to false.
   * Subclasses remove listeners, restore globals, etc. here.
   */
  protected abstract _onDisable(): void;

  /**
   * Final. Upstream uses `init()` to declare Node-style module patches; in
   * the browser there is nothing to patch this way. Subclasses must not
   * override this method.
   */
  protected override init() {
    return [];
  }
}
