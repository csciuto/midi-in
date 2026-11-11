# midi-in

A MIDI keyboard plays a web app. One small ES module over the Web MIDI API, shared by
[Meow Piano](https://corey.sciu.to/meowpiano/) and [Goob Nonna](https://corey.sciu.to/goob_nonna/).

Built with [Claude Code](https://claude.com/claude-code).

```js
import { initMidiIn } from './vendor/midi-in.js';

initMidiIn(document.getElementById('midiButton'), {
  noteOn(note, velocity) { /* MIDI note number; velocity 0..1 */ },
  noteOff(note) {},
  bend(value) {},        // pitch wheel, -1..1
  mod(value) {},         // mod wheel, 0..1
  sustain(down) {},      // sustain pedal
  clock() {},            // MIDI clock, 24 per quarter note; also start(), continue(), stop()
  allOff() {},           // MIDI was turned off: let go of held notes
  status(text) {},       // "KeyStep 37 connected", "MIDI off", ...
  active(on) {},         // for the button's pressed state
}, { storageKey: 'myapp.midiIn' });
```

Every hook is optional. The button turns MIDI on (the browser asks permission once) and off again. Once on,
it reconnects on later visits and picks up keyboards plugged in later. Off stays off, so the keyboard can play
another program alone. `parseMidi(bytes)` is exported for anything else.

Chrome, Edge and Firefox. Safari has no Web MIDI.

## Using it in an app

Apps keep their own copy at a pinned version, so nothing changes under an app until it chooses to update:

```bash
curl -fsSL https://raw.githubusercontent.com/csciuto/midi-in/v1.0.0/midi-in.js -o js/vendor/midi-in.js
```

Each app records the version it pins and tests that its copy says the same (`VERSION`).

## Changing it

`npm test` (Node's built-in runner, no install). Bump `VERSION` and `package.json` together, tag the commit
`vX.Y.Z`, then update each app's copy when that app wants the change.
