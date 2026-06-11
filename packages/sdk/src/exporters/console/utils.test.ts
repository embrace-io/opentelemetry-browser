/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpanStatusCode } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { describe, expect, it } from 'vitest';
import type { BadgeLevel } from './types.ts';
import { levelForSeverity, levelForStatus, stringifyBody } from './utils.ts';

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

  // Lock the exact band edges, where an off-by-one in the `<=` cascade would
  // hide. Each row is the raw SeverityNumber value and the level it must map to.
  it.each<[number, BadgeLevel]>([
    [-1, 'info'], // below UNSPECIFIED
    [0, 'info'], // UNSPECIFIED
    [1, 'trace'], // TRACE (first of band)
    [4, 'trace'], // TRACE4 (last of band)
    [5, 'debug'], // DEBUG (first of band)
    [8, 'debug'], // DEBUG4 (last of band)
    [9, 'info'], // INFO (first of band)
    [12, 'info'], // INFO4 (last of band)
    [13, 'warn'], // WARN (first of band)
    [16, 'warn'], // WARN4 (last of band)
    [17, 'error'], // ERROR (first of band)
    [24, 'error'], // FATAL4 (last of band)
    [25, 'error'], // above FATAL4
  ])('maps severity %i to "%s"', (severity, expected) => {
    expect(levelForSeverity(severity as SeverityNumber)).toBe(expected);
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

describe('stringifyBody', () => {
  it('returns strings unchanged', () => {
    expect(stringifyBody('already a string')).toBe('already a string');
  });

  it('JSON-stringifies serializable non-string bodies', () => {
    expect(stringifyBody({ a: 1, b: 'two' })).toBe('{"a":1,"b":"two"}');
    expect(stringifyBody([1, 2, 3])).toBe('[1,2,3]');
    expect(stringifyBody(42)).toBe('42');
  });

  it('falls back to String() when JSON.stringify yields undefined', () => {
    // JSON.stringify(undefined) returns undefined, so the `?? String(body)` arm takes over.
    expect(stringifyBody(undefined)).toBe('undefined');
  });

  it('falls back to String() when JSON.stringify throws on a circular body', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(stringifyBody(circular)).toBe('[object Object]');
  });

  it('returns a placeholder when even String() throws (circular null-prototype body)', () => {
    // No Object.prototype means no toString, so String() throws too.
    const hostile: Record<string, unknown> = Object.create(null);
    hostile['self'] = hostile;
    expect(stringifyBody(hostile)).toBe('[unserializable body]');
  });
});
