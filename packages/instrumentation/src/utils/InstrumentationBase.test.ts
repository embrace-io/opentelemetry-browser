/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { describe, expect, it } from 'vitest';
import { InstrumentationBase } from './InstrumentationBase.ts';

interface TestConfig extends InstrumentationConfig {
  marker?: string;
}

class TestInstrumentation extends InstrumentationBase<TestConfig> {
  public enableCount = 0;
  public disableCount = 0;

  constructor(config: TestConfig = {}) {
    super('test-instrumentation', '0.0.0', config);
    if (config.enabled === true) {
      this.enable();
    }
  }

  override enable(): void {
    if (this._enabled) {
      return;
    }
    this._enabled = true;
    this.enableCount++;
  }

  override disable(): void {
    if (!this._enabled) {
      return;
    }
    this._enabled = false;
    this.disableCount++;
  }

  readEnabled(): boolean {
    return this._enabled;
  }

  writeEnabled(value: boolean): void {
    this._enabled = value;
  }
}

describe('InstrumentationBase', () => {
  describe('default state', () => {
    it('starts disabled when no config is provided', () => {
      const inst = new TestInstrumentation();
      expect(inst.isEnabled()).toBe(false);
      expect(inst.enableCount).toBe(0);
    });

    it('starts disabled when config omits enabled', () => {
      const inst = new TestInstrumentation({ marker: 'x' });
      expect(inst.isEnabled()).toBe(false);
    });

    it('starts disabled when enabled is explicitly false', () => {
      const inst = new TestInstrumentation({ enabled: false });
      expect(inst.isEnabled()).toBe(false);
    });

    it('does not call enable() during super() construction', () => {
      const inst = new TestInstrumentation({ enabled: true });
      // The subclass constructor calls enable() exactly once, after super().
      // If the base class auto-enabled during super(), the field initializer
      // for enableCount would reset the counter back to 0 — but since super()
      // is suppressed, the explicit enable() call increments it to 1.
      expect(inst.enableCount).toBe(1);
      expect(inst.isEnabled()).toBe(true);
    });
  });

  describe('isEnabled / _enabled accessor', () => {
    it('reflects current _config.enabled value', () => {
      const inst = new TestInstrumentation();
      expect(inst.isEnabled()).toBe(false);

      inst.enable();
      expect(inst.isEnabled()).toBe(true);

      inst.disable();
      expect(inst.isEnabled()).toBe(false);
    });

    it('subclass _enabled getter mirrors public isEnabled()', () => {
      const inst = new TestInstrumentation({ enabled: true });
      expect(inst.readEnabled()).toBe(true);
      expect(inst.readEnabled()).toBe(inst.isEnabled());

      inst.disable();
      expect(inst.readEnabled()).toBe(false);
    });

    it('_enabled setter updates config.enabled', () => {
      const inst = new TestInstrumentation();
      inst.writeEnabled(true);
      expect(inst.getConfig().enabled).toBe(true);
      expect(inst.isEnabled()).toBe(true);

      inst.writeEnabled(false);
      expect(inst.getConfig().enabled).toBe(false);
      expect(inst.isEnabled()).toBe(false);
    });
  });

  describe('idempotent enable() / disable()', () => {
    it('enable() called twice runs the body only once', () => {
      const inst = new TestInstrumentation();
      inst.enable();
      inst.enable();
      inst.enable();
      expect(inst.enableCount).toBe(1);
      expect(inst.isEnabled()).toBe(true);
    });

    it('disable() before enable() is a no-op', () => {
      const inst = new TestInstrumentation();
      inst.disable();
      expect(inst.disableCount).toBe(0);
      expect(inst.isEnabled()).toBe(false);
    });

    it('disable() called twice runs the body only once', () => {
      const inst = new TestInstrumentation({ enabled: true });
      inst.disable();
      inst.disable();
      expect(inst.disableCount).toBe(1);
      expect(inst.isEnabled()).toBe(false);
    });

    it('enable/disable cycles increment counters as expected', () => {
      const inst = new TestInstrumentation();
      inst.enable();
      inst.disable();
      inst.enable();
      inst.disable();
      expect(inst.enableCount).toBe(2);
      expect(inst.disableCount).toBe(2);
    });
  });

  describe('config preservation', () => {
    it('preserves other config fields when _enabled toggles', () => {
      const inst = new TestInstrumentation({ marker: 'preserved' });
      inst.enable();
      expect(inst.getConfig().marker).toBe('preserved');

      inst.disable();
      expect(inst.getConfig().marker).toBe('preserved');
    });

    it('setConfig preserves the current enabled state when enabled is omitted', () => {
      const inst = new TestInstrumentation({ enabled: true });
      expect(inst.isEnabled()).toBe(true);

      inst.setConfig({ marker: 'after' });
      expect(inst.isEnabled()).toBe(true);
      expect(inst.getConfig().marker).toBe('after');
      expect(inst.enableCount).toBe(1);
    });

    it('setConfig with enabled:true on a disabled instance triggers enable()', () => {
      const inst = new TestInstrumentation();
      expect(inst.isEnabled()).toBe(false);

      inst.setConfig({ enabled: true, marker: 'turning-on' });
      expect(inst.isEnabled()).toBe(true);
      expect(inst.enableCount).toBe(1);
      expect(inst.getConfig().marker).toBe('turning-on');
    });

    it('setConfig with enabled:false on an enabled instance triggers disable()', () => {
      const inst = new TestInstrumentation({ enabled: true });
      expect(inst.disableCount).toBe(0);

      inst.setConfig({ enabled: false, marker: 'turning-off' });
      expect(inst.isEnabled()).toBe(false);
      expect(inst.disableCount).toBe(1);
      expect(inst.getConfig().marker).toBe('turning-off');
    });

    it('setConfig with the same enabled value does not retrigger lifecycle', () => {
      const inst = new TestInstrumentation({ enabled: true });
      expect(inst.enableCount).toBe(1);

      inst.setConfig({ enabled: true, marker: 'still-on' });
      expect(inst.enableCount).toBe(1);
      expect(inst.disableCount).toBe(0);
    });
  });
});
