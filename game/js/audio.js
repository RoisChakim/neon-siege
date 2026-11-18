// NEON SIEGE — audio.js. Procedural WebAudio effects, no audio files.
// Everything is synthesized at run time; the context starts on the first
// user gesture, as browsers require.

(function () {
  'use strict';

  var SIEGE = window.SIEGE;

  var ctx = null;
  var master = null;
  var muted = false;

  try {
    muted = localStorage.getItem('neon-siege-muted') === '1';
  } catch (e) { /* storage may be unavailable; sound just stays on */ }

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, low) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low || 900;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  var lastShot = 0;

  SIEGE.audio = {
    unlock: ensure,
    get muted() { return muted; },
    toggleMute: function () {
      muted = !muted;
      try { localStorage.setItem('neon-siege-muted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    shoot: function (weaponId) {
      var now = performance.now();
      if (now - lastShot < 45) return; // keep rapid fire from clipping
      lastShot = now;
      if (weaponId === 'scatter') { tone(190, 0.09, 'sawtooth', 0.16, 70); noise(0.06, 0.1, 1400); }
      else if (weaponId === 'rail') { tone(880, 0.16, 'sawtooth', 0.2, 140); noise(0.1, 0.14, 2600); }
      else { tone(660, 0.06, 'square', 0.1, 320); }
    },
    hit: function () { tone(220, 0.05, 'triangle', 0.12, 140); },
    explode: function (big) {
      noise(big ? 0.5 : 0.25, big ? 0.5 : 0.28, big ? 500 : 800);
      tone(big ? 90 : 120, big ? 0.4 : 0.2, 'sine', 0.3, 40);
    },
    hurt: function () { tone(140, 0.18, 'sawtooth', 0.25, 60); noise(0.12, 0.18, 500); },
    levelup: function () {
      tone(523, 0.1, 'triangle', 0.18);
      setTimeout(function () { tone(659, 0.1, 'triangle', 0.18); }, 90);
      setTimeout(function () { tone(784, 0.16, 'triangle', 0.2); }, 180);
    },
    reload: function () { tone(300, 0.08, 'square', 0.1, 520); },
    dash: function () { noise(0.14, 0.16, 3200); },
    click: function () { tone(520, 0.05, 'square', 0.1); },
    wave: function () { tone(392, 0.12, 'triangle', 0.16); setTimeout(function () { tone(523, 0.14, 'triangle', 0.16); }, 120); },
    boss: function () { tone(98, 0.5, 'sawtooth', 0.22, 55); noise(0.4, 0.2, 300); },
  };
})();
