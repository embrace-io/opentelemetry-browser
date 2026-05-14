/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DiagLogger } from '@opentelemetry/api';
import { DiagLogLevel, diag } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  protected _onEnable(): void {
    this.enableCount++;
  }

  protected _onDisable(): void {
    this.disableCount++;
  }

  readEnabled(): boolean {
    return this._enabled;
  }
}

class VetoableInstrumentation extends InstrumentationBase<TestConfig> {
  public allowEnable = false;
  public enableCount = 0;
  public disableCount = 0;

  constructor(config: TestConfig = {}) {
    super('vetoable-instrumentation', '0.0.0', config);
    if (config.enabled === true) {
      this.enable();
    }
  }

  protected override _canEnable(): boolean {
    return this.allowEnable;
  }

  protected _onEnable(): void {
    this.enableCount++;
  }

  protected _onDisable(): void {
    this.disableCount++;
  }
}

class ThrowingInstrumentation extends InstrumentationBase<TestConfig> {
  public throwOn: 'enable' | 'disable' | 'none' = 'none';

  constructor(config: TestConfig = {}) {
    super('throwing-instrumentation', '0.0.0', config);
    if (config.enabled === true) {
      this.enable();
    }
  }

  protected _onEnable(): void {
    if (this.throwOn === 'enable') {
      throw new Error('enable boom');
    }
  }

  protected _onDisable(): void {
    if (this.throwOn === 'disable') {
      throw new Error('disable boom');
    }
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
  });

  describe('_canEnable veto', () => {
    it('does not flip _enabled or call _onEnable when _canEnable returns false', () => {
      const inst = new VetoableInstrumentation();
      inst.allowEnable = false;

      inst.enable();

      expect(inst.isEnabled()).toBe(false);
      expect(inst.enableCount).toBe(0);
    });

    it('allows enable() to succeed on a later call once _canEnable returns true', () => {
      const inst = new VetoableInstrumentation();
      inst.allowEnable = false;
      inst.enable();
      expect(inst.isEnabled()).toBe(false);

      inst.allowEnable = true;
      inst.enable();
      expect(inst.isEnabled()).toBe(true);
      expect(inst.enableCount).toBe(1);
    });

    it('setConfig with enabled:true respects the _canEnable veto', () => {
      const inst = new VetoableInstrumentation();
      inst.allowEnable = false;

      inst.setConfig({ enabled: true });

      expect(inst.isEnabled()).toBe(false);
      expect(inst.enableCount).toBe(0);
    });

    it('does not consult _canEnable when disabling', () => {
      const inst = new VetoableInstrumentation();
      inst.allowEnable = true;
      inst.enable();
      expect(inst.isEnabled()).toBe(true);

      // Flip the veto to false and disable; teardown must run regardless.
      inst.allowEnable = false;
      inst.disable();

      expect(inst.isEnabled()).toBe(false);
      expect(inst.disableCount).toBe(1);
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

    it('setConfig omitting enabled on a disabled instance keeps it disabled', () => {
      const inst = new TestInstrumentation();
      expect(inst.isEnabled()).toBe(false);

      inst.setConfig({ marker: 'still-off' });

      expect(inst.isEnabled()).toBe(false);
      expect(inst.enableCount).toBe(0);
      expect(inst.disableCount).toBe(0);
      expect(inst.getConfig().marker).toBe('still-off');
    });
  });

  describe('getConfig snapshot', () => {
    it('returns a frozen snapshot that cannot mutate the live config', () => {
      const inst = new TestInstrumentation({ enabled: true, marker: 'init' });
      const snapshot = inst.getConfig();

      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(() => {
        (snapshot as { enabled: boolean }).enabled = false;
      }).toThrow();
      expect(inst.isEnabled()).toBe(true);
    });
  });

  describe('lifecycle error handling', () => {
    let errorMock: ReturnType<
      typeof vi.fn<(message: string, ...args: unknown[]) => void>
    >;
    let warnMock: ReturnType<
      typeof vi.fn<(message: string, ...args: unknown[]) => void>
    >;

    beforeEach(() => {
      errorMock = vi.fn<(message: string, ...args: unknown[]) => void>();
      warnMock = vi.fn<(message: string, ...args: unknown[]) => void>();
      const fakeLogger: DiagLogger = {
        verbose: () => {},
        debug: () => {},
        info: () => {},
        warn: warnMock,
        error: errorMock,
      };
      diag.setLogger(fakeLogger, DiagLogLevel.ALL);
    });

    afterEach(() => {
      diag.disable();
    });

    const sawTransitionLog = (
      mock: typeof errorMock,
      direction: 'false -> true' | 'true -> false',
    ) =>
      mock.mock.calls.some((call) => {
        const message = call[1];
        return (
          typeof message === 'string' &&
          message.includes('lifecycle transition') &&
          message.includes(direction)
        );
      });

    it('logs and rethrows when enable() throws during setConfig transition', () => {
      const inst = new ThrowingInstrumentation();
      inst.throwOn = 'enable';

      expect(() =>
        inst.setConfig({ enabled: true, marker: 'turning-on' }),
      ).toThrow('enable boom');

      expect(sawTransitionLog(errorMock, 'false -> true')).toBe(true);
    });

    it('logs and rethrows when disable() throws during setConfig transition', () => {
      const inst = new ThrowingInstrumentation({ enabled: true });
      inst.throwOn = 'disable';

      expect(() =>
        inst.setConfig({ enabled: false, marker: 'turning-off' }),
      ).toThrow('disable boom');

      expect(sawTransitionLog(errorMock, 'true -> false')).toBe(true);
    });

    it('logs and rethrows when enable() is called directly and the hook throws', () => {
      const inst = new ThrowingInstrumentation();
      inst.throwOn = 'enable';

      expect(() => inst.enable()).toThrow('enable boom');

      expect(sawTransitionLog(errorMock, 'false -> true')).toBe(true);
    });

    it('logs and rethrows when disable() is called directly and the hook throws', () => {
      const inst = new ThrowingInstrumentation({ enabled: true });
      inst.throwOn = 'disable';

      expect(() => inst.disable()).toThrow('disable boom');

      expect(sawTransitionLog(errorMock, 'true -> false')).toBe(true);
    });

    it('rolls _config.enabled back to false when _onEnable throws', () => {
      const inst = new ThrowingInstrumentation();
      inst.throwOn = 'enable';

      expect(() => inst.enable()).toThrow('enable boom');
      expect(inst.isEnabled()).toBe(false);
    });

    it('rolls _config.enabled back to true when _onDisable throws', () => {
      const inst = new ThrowingInstrumentation({ enabled: true });
      inst.throwOn = 'disable';

      expect(() => inst.disable()).toThrow('disable boom');
      expect(inst.isEnabled()).toBe(true);
    });

    it('allows a clean retry of enable() after the hook stops throwing', () => {
      const inst = new ThrowingInstrumentation();
      inst.throwOn = 'enable';

      expect(() => inst.enable()).toThrow('enable boom');
      expect(inst.isEnabled()).toBe(false);

      inst.throwOn = 'none';
      inst.enable();
      expect(inst.isEnabled()).toBe(true);
    });

    it('does not log when no transition occurs and subclass would throw', () => {
      const inst = new ThrowingInstrumentation({ enabled: true });
      inst.throwOn = 'enable';

      expect(() =>
        inst.setConfig({ enabled: true, marker: 'no-transition' }),
      ).not.toThrow();
      expect(errorMock).not.toHaveBeenCalled();
    });

    it('warns when setConfig requests enable but _canEnable() vetoes', () => {
      const inst = new VetoableInstrumentation();
      inst.allowEnable = false;

      inst.setConfig({ enabled: true });

      expect(inst.isEnabled()).toBe(false);
      const sawWarn = warnMock.mock.calls.some((call) => {
        const message = call[1];
        return (
          typeof message === 'string' &&
          message.includes('setConfig requested enable') &&
          message.includes('_canEnable() vetoed')
        );
      });
      expect(sawWarn).toBe(true);
    });

    it('does not warn when setConfig keeps the instance disabled without requesting enable', () => {
      const inst = new VetoableInstrumentation();
      inst.allowEnable = false;

      inst.setConfig({ marker: 'disabled-untouched' });

      expect(warnMock).not.toHaveBeenCalled();
    });
  });
});
