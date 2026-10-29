import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeNavigation,
  pushNavigation,
  navigationTab,
  goBack,
} from '../lib/navigation';

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');

let state: any = null;

let length = 1;

let href = 'https://fixture.invalid/profile';

let referrer = '';

let backs = 0;

let assigned = '';

let delta = 0;

const browser = {
  location: {
    get href() {
      return href;
    },
    get origin() {
      return new URL(href).origin;
    },
    assign(path: string) {
      assigned = path;
    },
  },
  history: {
    get state() {
      return state;
    },
    get length() {
      return length;
    },
    replaceState(value: any) {
      state = value;
    },
    pushState(value: any, _unused: string, url: string) {
      state = value;
      length++;
      href = url;
    },
    go(value: number) {
      delta = value;
      backs++;
    },
    back() {
      backs++;
    },
  },
};

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: browser,
});

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    get referrer() {
      return referrer;
    },
  },
});

after(() => {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete (globalThis as any).window;
  if (savedDocument)
    Object.defineProperty(globalThis, 'document', savedDocument);
  else delete (globalThis as any).document;
});

function reset(previous = '', count = 1) {
  state = { __NA: true };
  length = count;
  referrer = previous;
  href = 'https://fixture.invalid/profile';
  backs = 0;
  assigned = '';
  delta = 0;
}

test('direct and external entry fall back to home; internal previous page can go back', () => {
  reset();
  goBack();
  assert.equal(assigned, '/');
  assert.equal(backs, 0);
  reset('https://outside.invalid/', 10);
  goBack();
  assert.equal(assigned, '/');
  assert.equal(backs, 0);
  reset('https://fixture.invalid/about', 1);
  goBack();
  assert.equal(assigned, '/');
  reset('https://fixture.invalid/about', 3);
  goBack();
  assert.equal(backs, 1);
  assert.equal(assigned, '');
  assert.equal(state.__NA, true);
});

test('navigation preserves router state, deduplicates same tab and stores no private URL', () => {
  reset();
  href = 'https://fixture.invalid/s/private-capability?share=secret';
  initializeNavigation();
  pushNavigation(href, 'map');
  assert.equal(navigationTab(), 'map');
  assert.equal(length, 2);
  assert.equal(state.__NA, true);
  assert.deepEqual(state.questkeepsNavigation, {
    version: 1,
    back: true,
    tab: 'map',
    sectionSteps: 0,
  });
  assert.ok(!JSON.stringify(state).includes('private-capability'));
  assert.ok(!JSON.stringify(state).includes('secret'));
  pushNavigation(href, 'map');
  assert.equal(length, 2);
  initializeNavigation();
  assert.equal(navigationTab(), 'map');
  pushNavigation(href, 'made-up-tab');
  assert.equal(navigationTab(), 'gallery');
  assert.throws(() => pushNavigation('https://outside.invalid/', 'map'));
});

test('native same-origin navigation works without referrers and refuses an external previous entry', () => {
  reset('', 4);
  (browser as any).navigation = { canGoBack: true };
  goBack();
  assert.equal(backs, 1);
  reset('https://fixture.invalid/about', 4);
  (browser as any).navigation = { canGoBack: false };
  goBack();
  assert.equal(backs, 0);
  assert.equal(assigned, '/');
  delete (browser as any).navigation;
});

test('section back skips trip tabs and profile anchors without storing their URLs', () => {
  reset('', 5);
  href = 'https://fixture.invalid/?trip=fixture';
  (browser as any).navigation = {
    canGoBack: true,
    currentEntry: { index: 3 },
    entries: () => [
      { index: 0, url: 'https://fixture.invalid/' },
      { index: 1, url: href },
      { index: 2, url: href },
      { index: 3, url: href },
    ],
  };
  goBack();
  assert.equal(delta, -3);
  reset('', 3);
  href = 'https://fixture.invalid/profile#friends';
  (browser as any).navigation = {
    canGoBack: true,
    currentEntry: { index: 2 },
    entries: () => [
      { index: 0, url: 'https://fixture.invalid/about' },
      { index: 1, url: 'https://fixture.invalid/profile' },
      { index: 2, url: href },
    ],
  };
  goBack();
  assert.equal(delta, -2);
  delete (browser as any).navigation;
  reset('https://fixture.invalid/', 2);
  href = 'https://fixture.invalid/?trip=fixture';
  initializeNavigation();
  pushNavigation(href, 'map');
  pushNavigation(href, 'notes');
  goBack();
  assert.equal(delta, -3);
});

test('hidden document URLs retain section skip count after reload', () => {
  reset('', 4);
  href = 'https://fixture.invalid/?trip=fixture';
  state = {
    questkeepsNavigation: {
      version: 1,
      back: true,
      tab: 'notes',
      sectionSteps: 3,
    },
  };
  (browser as any).navigation = {
    canGoBack: true,
    currentEntry: { index: 3 },
    entries: () => [
      { index: 0, url: null },
      { index: 1, url: null },
      { index: 2, url: null },
      { index: 3, url: href },
    ],
  };
  goBack();
  assert.equal(delta, -3);
  delete (browser as any).navigation;
});

test('a restored tab fragment survives replaced router history metadata', () => {
  reset();
  href = 'https://fixture.invalid/?trip=fixture#view=notes';
  initializeNavigation();
  assert.equal(navigationTab(), 'notes');
  href = 'https://fixture.invalid/?trip=fixture#view=unknown';
  assert.equal(navigationTab(), 'gallery');
});
