import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMidi, initMidiIn, VERSION } from './midi-in.js';

test('the version matches package.json', () => {
  assert.equal(VERSION, JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version);
});

test('notes: on with velocity, off, and note-on at velocity 0 as off', () => {
  assert.deepEqual(parseMidi([0x90, 60, 127]), { type: 'noteOn', note: 60, velocity: 1, channel: 1 });
  assert.equal(parseMidi([0x93, 60, 64]).channel, 4);
  assert.ok(Math.abs(parseMidi([0x90, 60, 64]).velocity - 64 / 127) < 1e-9);
  assert.deepEqual(parseMidi([0x80, 60, 40]), { type: 'noteOff', note: 60, channel: 1 });
  assert.deepEqual(parseMidi([0x90, 60, 0]), { type: 'noteOff', note: 60, channel: 1 });
});

test('pitch bend runs -1 to 1 with 0 at rest', () => {
  assert.equal(parseMidi([0xe0, 0, 64]).value, 0);
  assert.equal(parseMidi([0xe0, 0, 0]).value, -1);
  assert.equal(parseMidi([0xe0, 127, 127]).value, 1);
});

test('controllers, clock and transport; everything else is ignored', () => {
  assert.deepEqual(parseMidi([0xb0, 1, 127]), { type: 'cc', controller: 1, value: 1, channel: 1 });
  assert.deepEqual(parseMidi([0xf8]), { type: 'clock' });
  assert.deepEqual(parseMidi([0xfa]), { type: 'start' });
  assert.deepEqual(parseMidi([0xfb]), { type: 'continue' });
  assert.deepEqual(parseMidi([0xfc]), { type: 'stop' });
  for (const junk of [[], null, [0xfe], [0xf0, 1, 2, 0xf7], [0xc0, 5], [0xd0, 9], [60, 100]]) assert.equal(parseMidi(junk), null);
});

/** A stand-in for the browser: one MIDI input, a button, and storage. */
function fakeBrowser({ midi = true, allowed = true, stored = {} } = {}) {
  const input = { name: 'KeyStep 37', onmidimessage: null };
  const access = { inputs: new Map([['a', input]]), onstatechange: null };
  globalThis.localStorage = { getItem: k => stored[k] ?? null, setItem: (k, v) => { stored[k] = v; }, removeItem: k => { delete stored[k]; } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: midi ? { requestMIDIAccess: async () => { if (!allowed) throw new Error('denied'); return access; } } : {} });
  let click = null;
  const button = { addEventListener: (_, fn) => { click = fn; } };
  const log = [];
  const hooks = new Proxy({}, { get: (_, name) => (...args) => log.push([name, ...args]) });
  return { input, access, button, press: () => click(), log, hooks, stored };
}
const settle = () => new Promise(r => setTimeout(r, 0));

test('the button turns MIDI on, hooks receive what the keyboard sends, and it is remembered', async () => {
  const b = fakeBrowser();
  const midi = initMidiIn(b.button, b.hooks, { storageKey: 'app.midi' });
  assert.equal(midi.isOn(), false);
  b.press(); await settle();
  assert.equal(midi.isOn(), true);
  assert.equal(b.stored['app.midi'], '1');
  assert.deepEqual(b.log, [['active', true], ['status', 'KeyStep 37 connected']]);
  b.log.length = 0;
  for (const bytes of [[0x90, 64, 127], [0x80, 64, 0], [0xe0, 0, 0], [0xb0, 1, 127], [0xb0, 64, 127], [0xb0, 64, 0], [0xf8], [0xfa]]) b.input.onmidimessage({ data: bytes });
  assert.deepEqual(b.log, [
    ['noteOn', 64, 1], ['noteOff', 64], ['bend', -1],
    ['cc', 1, 1], ['mod', 1], ['cc', 64, 1], ['sustain', true], ['cc', 64, 0], ['sustain', false],
    ['clock'], ['start'],
  ]);
});

test('pressing again turns it off, lets go of held notes, and forgets', async () => {
  const b = fakeBrowser();
  const midi = initMidiIn(b.button, b.hooks);
  b.press(); await settle(); b.log.length = 0;
  b.press();
  assert.equal(midi.isOn(), false);
  assert.equal(b.input.onmidimessage, null);
  assert.equal(b.stored.midiIn, undefined);
  assert.deepEqual(b.log, [['allOff'], ['active', false], ['status', 'MIDI off']]);
});

test('once on, it reconnects on the next visit without a press', async () => {
  const b = fakeBrowser({ stored: { midiIn: '1' } });
  const midi = initMidiIn(b.button, b.hooks);
  await settle();
  assert.equal(midi.isOn(), true);
});

test('a keyboard plugged in later is picked up', async () => {
  const b = fakeBrowser();
  initMidiIn(b.button, b.hooks);
  b.press(); await settle();
  const second = { name: 'Second', onmidimessage: null };
  b.access.inputs.set('b', second);
  b.access.onstatechange();
  assert.equal(typeof second.onmidimessage, 'function');
  assert.deepEqual(b.log.at(-1), ['status', 'KeyStep 37, Second connected']);
});

test('no Web MIDI, or permission refused: a message, and nothing remembered', async () => {
  let b = fakeBrowser({ midi: false });
  initMidiIn(b.button, b.hooks); b.press(); await settle();
  assert.deepEqual(b.log, [['status', 'this browser has no MIDI: use Chrome, Edge or Firefox']]);
  b = fakeBrowser({ allowed: false, stored: { midiIn: '1' } });
  const midi = initMidiIn(b.button, b.hooks); await settle();
  assert.equal(midi.isOn(), false);
  assert.equal(b.stored.midiIn, undefined);
  assert.deepEqual(b.log, []);          // a remembered connection that fails stays quiet
});

test('hooks are optional, and feed() plays bytes without a keyboard', () => {
  const b = fakeBrowser();
  const got = [];
  const midi = initMidiIn(b.button, { noteOn: (n, v) => got.push([n, v]) }, { storageKey: null });
  midi.feed([0x90, 60, 127]); midi.feed([0xe0, 0, 64]); midi.feed([0xf8]);
  assert.deepEqual(got, [[60, 1]]);
});
