/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes } from '@opentelemetry/api';
import type { LogRecord } from '@opentelemetry/api-logs';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { safeExecuteInTheMiddle } from '@opentelemetry/instrumentation';
import type {
  CLSMetricWithAttribution,
  INPMetricWithAttribution,
  MetricWithAttribution,
} from 'web-vitals/attribution';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals/attribution';
import { InstrumentationBase } from '#utils';
import { version } from '../../package.json' with { type: 'json' };
import {
  ATTR_WEB_VITAL_DELTA,
  ATTR_WEB_VITAL_ID,
  ATTR_WEB_VITAL_NAME,
  ATTR_WEB_VITAL_NAVIGATION_TYPE,
  ATTR_WEB_VITAL_RATING,
  ATTR_WEB_VITAL_VALUE,
  WEB_VITAL_EVENT_NAME,
} from './semconv.ts';
import type { WebVitalsInstrumentationConfig } from './types.ts';

/**
 * Instrumentation for Core Web Vitals using the `web-vitals` library.
 * https://github.com/GoogleChrome/web-vitals
 *
 * Note: The `web-vitals` library does not support removing listeners once
 * registered. Calling `disable()` will stop emitting logs, but the underlying
 * listeners remain active. Calling `enable()` again will resume emission.
 */
export class WebVitalsInstrumentation extends InstrumentationBase<WebVitalsInstrumentationConfig> {
  private _listenersRegistered = false;

  constructor(config: WebVitalsInstrumentationConfig = {}) {
    super('@opentelemetry/browser-instrumentation/web-vitals', version, config);
    if (config.enabled === true) {
      this.enable();
    }
  }

  protected override _canEnable(): boolean {
    if (typeof PerformanceObserver === 'undefined') {
      this._diag.debug(
        'PerformanceObserver not supported, web vitals will not be collected',
      );
      return false;
    }
    return true;
  }

  /**
   * Listeners are registered once per instance; because web-vitals can't
   * unsubscribe, disable() leaves them in place and only pauses emission.
   * A subsequent enable() resumes emission without re-registering.
   */
  protected _onEnable(): void {
    if (this._listenersRegistered) {
      this._diag.debug('Listeners already registered, resuming emission');
      return;
    }

    this._diag.debug(`Registering listeners`);
    // Each registration is isolated: a vital whose underlying observer type
    // isn't supported by the browser (CLS uses LayoutShift, INP uses
    // EventTiming, etc.) throws synchronously from the web-vitals library.
    // Catch per-vital so a single unsupported entry type does not quarantine
    // the others. CLS is only supported in Chromium. See:
    // https://github.com/GoogleChrome/web-vitals?tab=readme-ov-file#browser-support
    const tryRegister = (
      name: 'CLS' | 'INP' | 'LCP' | 'FCP' | 'TTFB',
      subscribe: (cb: (metric: MetricWithAttribution) => void) => void,
    ) => {
      try {
        subscribe((metric) => this._emitWebVital(metric));
      } catch (e) {
        this._diag.error(`failed to register ${name} listener`, e);
      }
    };
    tryRegister('CLS', onCLS);
    tryRegister('INP', onINP);
    tryRegister('LCP', onLCP);
    tryRegister('FCP', onFCP);
    tryRegister('TTFB', onTTFB);

    // Set the guard only after all attempts complete so a throw above does
    // not lock us into "already registered" mode on a future enable() retry.
    this._listenersRegistered = true;
  }

  protected _onDisable(): void {
    this._diag.debug('Instrumentation disabled, pausing emission');
  }

  /**
   * Gets the timestamp for a metric based on attribution timing.
   * Returns undefined to let OTel use the current time for metrics without
   * specific timing information.
   */
  private _getTimestampForMetric(
    metric: MetricWithAttribution,
  ): number | undefined {
    if (metric.name === 'CLS') {
      const { attribution } = metric as CLSMetricWithAttribution;
      if (attribution.largestShiftTime !== undefined) {
        return attribution.largestShiftTime;
      }
      return undefined;
    }
    if (metric.name === 'INP') {
      const { attribution } = metric as INPMetricWithAttribution;
      return attribution.interactionTime;
    }
    // FCP, LCP, TTFB: metric.value is already DOMHighResTimeStamp of the event
    return metric.value;
  }

  private _emitWebVital(metric: MetricWithAttribution): void {
    if (!this._enabled) {
      return;
    }
    const attributes: Attributes = {
      [ATTR_WEB_VITAL_NAME]: metric.name.toLowerCase(),
      [ATTR_WEB_VITAL_VALUE]: metric.value,
      // `delta` equals `value` on the first emission; subsequent emissions report only the change
      [ATTR_WEB_VITAL_DELTA]: metric.delta,
      [ATTR_WEB_VITAL_RATING]: metric.rating,
      [ATTR_WEB_VITAL_ID]: metric.id,
      [ATTR_WEB_VITAL_NAVIGATION_TYPE]: metric.navigationType,
    };

    const timestamp = this._getTimestampForMetric(metric);

    const logRecord: LogRecord = {
      eventName: WEB_VITAL_EVENT_NAME,
      severityNumber: SeverityNumber.INFO,
      attributes,
      ...(this._config.includeRawAttribution === true
        ? { body: JSON.stringify(metric.attribution) }
        : {}),
      ...(timestamp !== undefined ? { timestamp } : {}),
    };

    const applyCustomLogRecordData = this._config.applyCustomLogRecordData;
    if (applyCustomLogRecordData) {
      safeExecuteInTheMiddle(
        () => applyCustomLogRecordData(logRecord),
        (error) => {
          if (error) {
            this._diag.error('applyCustomLogRecordData hook failed', error);
          }
        },
        true,
      );
    }

    this.logger.emit(logRecord);
  }
}
