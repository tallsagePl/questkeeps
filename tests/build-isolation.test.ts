import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from 'next/constants';
import configure from '../next.config';

test('development, production and browser tests use independent Next output directories', () => {
  const old = process.env.QUESTKEEPS_E2E;
  try {
    delete process.env.QUESTKEEPS_E2E;
    assert.equal(configure(PHASE_DEVELOPMENT_SERVER).distDir, '.next-dev');
    assert.equal(configure(PHASE_PRODUCTION_BUILD).distDir, '.next');
    assert.equal(configure(PHASE_PRODUCTION_SERVER).distDir, '.next');
    process.env.QUESTKEEPS_E2E = '1';
    assert.equal(configure(PHASE_DEVELOPMENT_SERVER).distDir, '.next-e2e');
  } finally {
    if (old === undefined) delete process.env.QUESTKEEPS_E2E;
    else process.env.QUESTKEEPS_E2E = old;
  }
});
