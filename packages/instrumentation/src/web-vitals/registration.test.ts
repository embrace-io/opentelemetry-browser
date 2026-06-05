/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// `registered` must be created via vi.hoisted so the hoisted vi.mock factory
// can reference it.
const { registered } = vi.hoisted(() => ({ registered: [] as string[] }));

// Make CLS registration throw synchronously (mirrors a browser without the
// LayoutShift entry type), and have the rest record that they were reached.
vi.mock('web-vitals/attribution', () => ({
  onCLS: () => {
    throw new Error('LayoutShift not supported');
  },
  onINP: () => registered.push('INP'),
  onLCP: () => registered.push('LCP'),
  onFCP: () => registered.push('FCP'),
  onTTFB: () => registered.push('TTFB'),
}));

import { WebVitalsInstrumentation } from './instrumentation.ts';

describe('WebVitalsInstrumentation registration isolation', () => {
  afterEach(() => {
    registered.length = 0;
  });

  it('registers the remaining vitals when one throws synchronously', () => {
    let instrumentation: WebVitalsInstrumentation | undefined;

    // CLS throws inside enable(); it must be caught so construction does not
    // throw and the other four vitals still register.
    expect(() => {
      instrumentation = new WebVitalsInstrumentation({ enabled: true });
    }).not.toThrow();

    instrumentation?.disable();
    expect(registered).toEqual(['INP', 'LCP', 'FCP', 'TTFB']);
  });
});
