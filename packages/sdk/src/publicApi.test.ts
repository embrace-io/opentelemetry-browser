/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Pulls in Vite's ambient module types so tsc accepts the `?raw` imports
// below (which resolve to the file contents as a string at test time).
/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import indexDts from '../dist/index.d.ts?raw';
import logsDts from '../dist/logs/index.d.ts?raw';
import sessionDts from '../dist/session/index.d.ts?raw';
import tracesDts from '../dist/traces/index.d.ts?raw';

// Guards the package's public type surface. Each snapshot is the emitted
// barrel declaration for a subpath in the package.json `exports` map. If a
// snapshot fails, the public API changed: only run `vitest -u` if that change
// was intended. Requires `npm run build` first (CI builds before test).
describe('public API surface', () => {
  it('exposes the expected types and values from "."', () => {
    expect(indexDts).toMatchSnapshot();
  });

  it('exposes the expected types and values from "./logs"', () => {
    expect(logsDts).toMatchSnapshot();
  });

  it('exposes the expected types and values from "./traces"', () => {
    expect(tracesDts).toMatchSnapshot();
  });

  it('exposes the expected types and values from "./session"', () => {
    expect(sessionDts).toMatchSnapshot();
  });
});
