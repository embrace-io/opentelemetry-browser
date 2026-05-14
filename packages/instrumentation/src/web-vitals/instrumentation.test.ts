/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { setupTestLogExporter } from '#utils/test';
import { WebVitalsInstrumentation } from './instrumentation.ts';
import {
  ATTR_WEB_VITAL_DELTA,
  ATTR_WEB_VITAL_ID,
  ATTR_WEB_VITAL_NAME,
  ATTR_WEB_VITAL_NAVIGATION_TYPE,
  ATTR_WEB_VITAL_RATING,
  ATTR_WEB_VITAL_VALUE,
  WEB_VITAL_EVENT_NAME,
} from './semconv.ts';

describe('WebVitalsInstrumentation', () => {
  let inMemoryExporter: InMemoryLogRecordExporter;
  let instrumentation: WebVitalsInstrumentation;
  let testContainer: HTMLDivElement;

  beforeAll(() => {
    inMemoryExporter = setupTestLogExporter();
  });

  beforeEach(() => {
    testContainer = document.createElement('div');
    testContainer.id = 'test-container';
    document.body.appendChild(testContainer);
    instrumentation = new WebVitalsInstrumentation();
  });

  afterEach(() => {
    instrumentation?.disable();
    inMemoryExporter.reset();
    testContainer?.remove();
  });

  const getWebVitalLogs = () =>
    inMemoryExporter
      .getFinishedLogRecords()
      .filter((log) => log.eventName === WEB_VITAL_EVENT_NAME);

  const triggerVisibilityChange = () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  };

  const waitForMetric = async (
    metricName: string,
    timeoutMs = 1000,
  ): Promise<ReturnType<typeof getWebVitalLogs>[0]> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const logs = getWebVitalLogs();
      const found = logs.find(
        (log) => log.attributes[ATTR_WEB_VITAL_NAME] === metricName,
      );
      if (found) {
        return found;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(
      `Metric "${metricName}" not captured within ${timeoutMs}ms`,
    );
  };

  const createButton = (name: string, busyWaitMs = 16) => {
    const button = document.createElement('button');
    button.textContent = name;
    button.addEventListener('click', () => {
      const start = performance.now();
      while (performance.now() - start < busyWaitMs) {
        // busy wait
      }
    });
    testContainer.appendChild(button);
    return button;
  };

  const triggerINP = async (buttonName: string) => {
    await userEvent.click(page.getByRole('button', { name: buttonName }));
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    await new Promise((r) => setTimeout(r, 100));
    triggerVisibilityChange();
  };

  describe('INP metric', () => {
    it('should emit INP after user interaction', async () => {
      instrumentation.enable();
      createButton('Click me');

      await triggerINP('Click me');

      const inpLog = await waitForMetric('inp');

      expect(inpLog.attributes[ATTR_WEB_VITAL_VALUE]).toBeGreaterThanOrEqual(0);
      expect(inpLog.attributes[ATTR_WEB_VITAL_DELTA]).toBeGreaterThanOrEqual(0);
      expect(inpLog.attributes[ATTR_WEB_VITAL_ID]).toBeDefined();
      expect(inpLog.attributes[ATTR_WEB_VITAL_NAVIGATION_TYPE]).toBeDefined();
      expect(['good', 'needs-improvement', 'poor']).toContain(
        inpLog.attributes[ATTR_WEB_VITAL_RATING],
      );
    });
  });

  describe('CLS metric', () => {
    it('should emit CLS after layout shift', async () => {
      instrumentation.enable();

      const shifter = document.createElement('div');
      shifter.id = 'shifter';
      shifter.style.cssText =
        'width: 100px; height: 100px; background: red; position: relative;';
      testContainer.appendChild(shifter);

      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await new Promise((r) => setTimeout(r, 100));

      const pusher = document.createElement('div');
      pusher.style.cssText = 'width: 100px; height: 200px; background: blue;';
      testContainer.insertBefore(pusher, shifter);

      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await new Promise((r) => setTimeout(r, 100));

      triggerVisibilityChange();

      const clsLog = await waitForMetric('cls');

      expect(typeof clsLog.attributes[ATTR_WEB_VITAL_VALUE]).toBe('number');
      expect(clsLog.attributes[ATTR_WEB_VITAL_VALUE]).toBeGreaterThanOrEqual(0);
      expect(clsLog.attributes[ATTR_WEB_VITAL_DELTA]).toBeGreaterThanOrEqual(0);
      expect(clsLog.attributes[ATTR_WEB_VITAL_ID]).toBeDefined();
      expect(['good', 'needs-improvement', 'poor']).toContain(
        clsLog.attributes[ATTR_WEB_VITAL_RATING],
      );
    });
  });

  describe('enable/disable', () => {
    it('should not emit metrics when disabled', async () => {
      expect(instrumentation.isEnabled()).toBe(false);

      const button = document.createElement('button');
      button.textContent = 'Disabled test';
      testContainer.appendChild(button);

      await userEvent.click(
        page.getByRole('button', { name: 'Disabled test' }),
      );
      triggerVisibilityChange();
      await new Promise((r) => setTimeout(r, 200));

      const logs = getWebVitalLogs();
      expect(logs.length).toBe(0);
    });

    it('should resume emitting after re-enable', async () => {
      instrumentation.enable();
      instrumentation.disable();
      instrumentation.enable();

      createButton('Re-enabled test');
      await triggerINP('Re-enabled test');

      const inpLog = await waitForMetric('inp');
      expect(inpLog.attributes[ATTR_WEB_VITAL_NAME]).toBe('inp');
    });

    it('should emit each metric exactly once per interaction across enable/disable cycles', async () => {
      // web-vitals callbacks can't be unsubscribed, so disable() must NOT
      // re-register them on the next enable(). A regression where the
      // _listenersRegistered guard is removed would double-emit per metric.
      instrumentation.enable();
      instrumentation.disable();
      instrumentation.enable();
      instrumentation.disable();
      instrumentation.enable();

      createButton('Cycle test');
      await triggerINP('Cycle test');
      await waitForMetric('inp');

      const inpLogs = getWebVitalLogs().filter(
        (log) => log.attributes[ATTR_WEB_VITAL_NAME] === 'inp',
      );
      expect(inpLogs).toHaveLength(1);
    });

    it('should register the five web-vitals listeners only once across multiple enable cycles', () => {
      // The INP assertion above covers the observable consequence for one
      // metric. This assertion covers the registration-guard contract for all
      // five (CLS, INP, LCP, FCP, TTFB) at the same time by counting calls to
      // the protected `_diag` registration log. Across multiple enable cycles
      // the "Registering listeners" debug log must appear exactly once; every
      // subsequent enable() must take the "already registered" branch.
      const debugLog = vi.fn();
      const fakeLogger = {
        verbose: () => {},
        debug: debugLog,
        info: () => {},
        warn: () => {},
        error: () => {},
      };
      const localInstrumentation = new WebVitalsInstrumentation();
      (localInstrumentation as unknown as { _diag: typeof fakeLogger })._diag =
        fakeLogger;

      localInstrumentation.enable();
      localInstrumentation.disable();
      localInstrumentation.enable();
      localInstrumentation.disable();
      localInstrumentation.enable();

      const registrationLogs = debugLog.mock.calls.filter((call) => {
        const message = call[0];
        return (
          typeof message === 'string' &&
          message.includes('Registering listeners')
        );
      });
      expect(registrationLogs).toHaveLength(1);

      const resumeLogs = debugLog.mock.calls.filter((call) => {
        const message = call[0];
        return (
          typeof message === 'string' &&
          message.includes('Listeners already registered')
        );
      });
      expect(resumeLogs).toHaveLength(2);

      localInstrumentation.disable();
    });
  });

  describe('includeRawAttribution', () => {
    it('should include attribution as body when includeRawAttribution is true', async () => {
      instrumentation.setConfig({
        enabled: true,
        includeRawAttribution: true,
      });

      createButton('Attribution test');
      await triggerINP('Attribution test');

      const inpLog = await waitForMetric('inp');
      expect(inpLog.body).toBeDefined();
      const parsed = JSON.parse(inpLog.body as string);
      expect(parsed).toHaveProperty('interactionTime');
    });
  });

  describe('applyCustomLogRecordData hook', () => {
    it('should catch and log errors from hook without crashing', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const errorHook = vi.fn(() => {
        throw new Error('Hook error');
      });

      instrumentation.setConfig({
        enabled: true,
        applyCustomLogRecordData: errorHook,
      });

      createButton('Hook error test');
      await triggerINP('Hook error test');

      const inpLog = await waitForMetric('inp');
      expect(inpLog.attributes[ATTR_WEB_VITAL_NAME]).toBe('inp');
      expect(errorHook).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should allow hook to add custom attributes', async () => {
      const customHook = vi.fn((logRecord) => {
        logRecord.attributes['custom.page'] = 'test-page';
      });

      instrumentation.setConfig({
        enabled: true,
        applyCustomLogRecordData: customHook,
      });

      createButton('Custom attr test');
      await triggerINP('Custom attr test');

      const inpLog = await waitForMetric('inp');
      expect(inpLog.attributes['custom.page']).toBe('test-page');
      expect(customHook).toHaveBeenCalled();
    });
  });
});
