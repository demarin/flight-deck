// Run: npm test
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const PRE_INVOCATION = path.join(ROOT, 'hooks', 'antigravity', 'pre-invocation.js');
const { render, OUT } = require('../scripts/build-antigravity-rules');

function freshDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'flight-deck-agy-test-'));
}

function hook(input, dataDir, env = {}) {
  const res = spawnSync(process.execPath, [PRE_INVOCATION], {
    cwd: ROOT, // Antigravity runs hooks from the folder that holds hooks.json
    input: JSON.stringify({ conversationId: 'c1', invocationNum: 1, ...input }),
    encoding: 'utf8',
    env: { ...process.env, FLIGHT_DECK: '', PLUGIN_DATA: dataDir, ...env },
  });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
}

test('ordinary prompt while on: nothing injected, the rule does the work', () => {
  assert.deepEqual(hook({ lastUserInput: 'fix the bug' }, freshDataDir()), {});
});

test('/flight-deck off terminates the turn with a user-only message, then each call carries the OFF note', () => {
  const dir = freshDataDir();
  const res = hook({ lastUserInput: '/flight-deck off' }, dir);
  assert.equal(res.terminationBehavior, 'terminate');
  assert.match(res.injectSteps[0].errorMessage.userMessage, /OFF for this conversation/);

  const next = hook({ lastUserInput: 'fix the bug', invocationNum: 2 }, dir);
  assert.match(next.injectSteps[0].ephemeralMessage, /^FLIGHT DECK OFF/);
});

test('the slash is optional and status reports the stored mode', () => {
  const dir = freshDataDir();
  hook({ lastUserInput: 'flight-deck off' }, dir);
  assert.match(hook({ lastUserInput: '/flight-deck status' }, dir).injectSteps[0].errorMessage.userMessage, /OFF/);
  hook({ lastUserInput: '/flight-deck:flight-deck on' }, dir);
  assert.deepEqual(hook({ lastUserInput: 'next task' }, dir), {});
});

test('unknown argument is reported and changes nothing', () => {
  const dir = freshDataDir();
  const res = hook({ lastUserInput: '/flight-deck turbo' }, dir);
  assert.match(res.injectSteps[0].errorMessage.userMessage, /unknown argument/);
  assert.deepEqual(hook({ lastUserInput: 'x' }, dir), {});
});

test('the mode is per conversation', () => {
  const dir = freshDataDir();
  hook({ lastUserInput: '/flight-deck off', conversationId: 'a' }, dir);
  assert.deepEqual(hook({ lastUserInput: 'x', conversationId: 'b' }, dir), {});
});

test('a command inside a longer message is an ordinary prompt', () => {
  assert.deepEqual(hook({ lastUserInput: 'please run /flight-deck off later' }, freshDataDir()), {});
});

test('FLIGHT_DECK=off starts conversations off', () => {
  const res = hook({ lastUserInput: 'x' }, freshDataDir(), { FLIGHT_DECK: 'off' });
  assert.match(res.injectSteps[0].ephemeralMessage, /^FLIGHT DECK OFF/);
});

test('a new conversation prunes state untouched for 14 days; invocationNum 0 is what agy sends', () => {
  const dir = freshDataDir();
  hook({ lastUserInput: '/flight-deck off', conversationId: 'old' }, dir);
  const oldFile = path.join(dir, 'state', 'old.json');
  const past = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, past, past);

  hook({ lastUserInput: 'x', conversationId: 'new', invocationNum: 0 }, dir);
  assert.equal(fs.existsSync(oldFile), false);
});

test('rules/AGENTS.md is up to date with SKILL.md and fits the 24 KB rule limit', () => {
  const actual = fs.readFileSync(OUT, 'utf8');
  assert.equal(actual, render(), 'stale: run `npm run build`');
  assert.ok(Buffer.byteLength(actual) < 24000);
});
