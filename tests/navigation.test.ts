import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeNavigation,
  pushNavigation,
  navigationTab,
  goBack,
} from '../lib/navigation';
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'),
  savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
let state: any = null,
  length = 1,
  href = 'https://fixture.invalid/profile',
  referrer = '',
  backs = 0,
  assigned = '';
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
