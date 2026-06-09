/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { describe, expect, it } from 'vitest';
import {
  colorForLevel,
  DEFAULT_COLORS,
  levelForSeverity,
  levelForStatus,
} from './utils.ts';

describe('levelForSeverity', () => {
  it('maps trace severities to "trace"', () => {
    expect(levelForSeverity(SeverityNumber.TRACE)).toBe('trace');
    expect(levelForSeverity(SeverityNumber.TRACE4)).toBe('trace');
  });

  it('maps debug severities to "debug"', () => {
    expect(levelForSeverity(SeverityNumber.DEBUG)).toBe('debug');
    expect(levelForSeverity(SeverityNumber.DEBUG4)).toBe('debug');
  });

  it('maps info severities to "info"', () => {
    expect(levelForSeverity(SeverityNumber.INFO)).toBe('info');
    expect(levelForSeverity(SeverityNumber.INFO4)).toBe('info');
  });

  it('maps warn severities to "warn"', () => {
    expect(levelForSeverity(SeverityNumber.WARN)).toBe('warn');
    expect(levelForSeverity(SeverityNumber.WARN4)).toBe('warn');
  });

  it('maps error and fatal severities to "error"', () => {
    expect(levelForSeverity(SeverityNumber.ERROR)).toBe('error');
    expect(levelForSeverity(SeverityNumber.FATAL4)).toBe('error');
  });

  it('defaults unspecified/undefined to "info"', () => {
    expect(levelForSeverity(SeverityNumber.UNSPECIFIED)).toBe('info');
    expect(levelForSeverity(undefined)).toBe('info');
  });
});

describe('levelForStatus', () => {
  it('maps ERROR status to "error"', () => {
    expect(levelForStatus(SpanStatusCode.ERROR)).toBe('error');
  });

  it('maps OK and UNSET status to "ok"', () => {
    expect(levelForStatus(SpanStatusCode.OK)).toBe('ok');
    expect(levelForStatus(SpanStatusCode.UNSET)).toBe('ok');
  });
});

describe('colorForLevel', () => {
  it('returns the default color for a level', () => {
    expect(colorForLevel('info')).toBe(DEFAULT_COLORS.info);
    expect(colorForLevel('ok')).toBe(DEFAULT_COLORS.ok);
  });

  it('prefers an override when provided for that level', () => {
    expect(colorForLevel('info', { info: '#000000' })).toBe('#000000');
  });

  it('falls back to default when override omits the level', () => {
    expect(colorForLevel('warn', { info: '#000000' })).toBe(
      DEFAULT_COLORS.warn,
    );
  });
});
