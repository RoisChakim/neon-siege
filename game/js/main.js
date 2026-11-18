// NEON SIEGE — main.js. Boot, fixed-timestep loop, screen flow, clicks and
// staged screenshot scenes (?shot=title|play|boss|upgrade|over&seed=1).

(function () {
  'use strict';

  var SIEGE = window.SIEGE;
  var FIELD = SIEGE.FIELD;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var touchUI = document.getElementById('touch-ui');

  var difficulty = 'normal';
  var st = SIEGE.newRun(difficulty);
  st.screen = 'title';

  var last = performance.now();
  var acc = 0;
  var STEP = 1 / 60;
  var bot = null; // staged-scene autopilot: {move: 0, fire: true}

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var scale = Math.min(window.innerWidth / FIELD.w, window.innerHeight / FIELD.h);
    var w = Math.floor(FIELD.w * scale);
    var h = Math.floor(FIELD.h * scale);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(FIELD.w * dpr);
    canvas.height = Math.floor(FIELD.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    SIEGE.input.setScale(scale, 0, 0);
    // The upgrade screen lays out differently on portrait phones.
    SIEGE.view = { portrait: window.innerHeight > window.innerWidth };
  }
  window.addEventListener('resize', resize);
  resize();

  function startRun(diff) {
    difficulty = diff || difficulty;
    st = SIEGE.newRun(difficulty);
    SIEGE.startWave(st);
  }

  function inRect(x, y, r) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function onPointerDown(x, y) {
    if (st.screen === 'title') {
      var L = SIEGE.layout.title;
      if (!L) return;
      if (inRect(x, y, L.santai)) { difficulty = 'santai'; SIEGE.audio.click(); return; }
      if (inRect(x, y, L.normal)) { difficulty = 'normal'; SIEGE.audio.click(); return; }
      if (inRect(x, y, L.enter)) startRun(difficulty);
      return;
    }
    if (st.screen === 'upgrade' && st.offer) {
      var cards = SIEGE.layout.upgrade || [];
      for (var i = 0; i < cards.length; i++) {
        if (inRect(x, y, cards[i])) {
          SIEGE.applySkill(st, cards[i].skill);
          return;
        }
      }
      return;
    }
    if (st.screen === 'gameover') {
      var o = SIEGE.layout.over;
      if (o && inRect(x, y, o.restart)) startRun(difficulty);
    }
  }

  function onKey(code, down) {
    if (!down) return;
    if (code === 'KeyM') { SIEGE.audio.toggleMute(); return; }
    if (st.screen === 'title') {
      if (code === 'Enter' || code === 'Space') startRun(difficulty);
      else if (code === 'Digit1') { difficulty = 'santai'; SIEGE.audio.click(); }
      else if (code === 'Digit2') { difficulty = 'normal'; SIEGE.audio.click(); }
      return;
    }
    if (st.screen === 'playing') {
      if (code === 'Space') SIEGE.dash(st);
      else if (code === 'KeyE') SIEGE.fireUlti(st);
      else if (code === 'KeyQ') SIEGE.cycleWeapon(st);
      else if (code === 'Digit1') SIEGE.selectWeapon(st, 'pulse');
      else if (code === 'Digit2') SIEGE.selectWeapon(st, 'scatter');
      else if (code === 'Digit3') SIEGE.selectWeapon(st, 'rail');
      else if (code === 'KeyR') SIEGE.manualReload(st);
      else if (code === 'KeyP' || code === 'Escape') { st.screen = 'paused'; SIEGE.audio.click(); }
      return;
    }
    if (st.screen === 'upgrade' && st.offer) {
      var n = { Digit1: 0, Digit2: 1, Digit3: 2 }[code];
      if (n != null && st.offer[n]) SIEGE.applySkill(st, st.offer[n]);
      return;
    }
    if (st.screen === 'paused') {
      if (code === 'KeyP' || code === 'Escape') { st.screen = 'playing'; SIEGE.audio.click(); }
      else if (code === 'KeyR') startRun(difficulty);
      return;
    }
    if (st.screen === 'gameover') {
      if (code === 'KeyR' || code === 'Enter' || code === 'Space') startRun(difficulty);
    }
  }

  SIEGE.input.attach(canvas, {
    onKey: onKey,
    onPointerDown: onPointerDown,
    onSwap: function () { if (st.screen === 'playing') SIEGE.cycleWeapon(st); },
    onDash: function () { if (st.screen === 'playing') SIEGE.dash(st); },
    onUlti: function () { if (st.screen === 'playing') SIEGE.fireUlti(st); },
  });

  // Show the touch buttons on coarse pointers (phones/tablets).
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    touchUI.classList.add('active');
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') touchUI.classList.add('active');
  });

  // --- Staged scenes for screenshots ---------------------------------------
  // ?shot=title | play | boss | upgrade | over, with &seed=N.
  var params = new URLSearchParams(location.search);
  var shot = params.get('shot');
  var seed = Number(params.get('seed') || 1);

  function simulate(seconds) {
    bot = { t: 0, fire: true };
    var steps = Math.floor(seconds * 60);
    for (var i = 0; i < steps; i++) {
      // Autopilot: drift in a slow circle, trigger held.
      var a = (i / 60) * 0.9;
      SIEGE.input.keys['KeyW'] = Math.sin(a) < 0;
      SIEGE.input.keys['KeyS'] = Math.sin(a) >= 0;
      SIEGE.input.keys['KeyA'] = Math.cos(a) < 0;
      SIEGE.input.keys['KeyD'] = Math.cos(a) >= 0;
      SIEGE.input.keys['KeyJ'] = true;
      SIEGE.update(st, STEP, SIEGE.input);
      // Autopilot picks the first skill so the run keeps going.
      if (st.offer) SIEGE.applySkill(st, st.offer[0]);
      if (st.screen !== 'playing') break;
    }
    SIEGE.input.keys['KeyJ'] = false;
    ['KeyW', 'KeyS', 'KeyA', 'KeyD'].forEach(function (k) { SIEGE.input.keys[k] = false; });
    bot = null;
  }

  function stagePlay(seconds) {
    startRun('normal');
    simulate(seconds);
    // Re-center the hero for the cover shot; the world stays as simulated.
    st.player.x = FIELD.w / 2;
    st.player.y = FIELD.h / 2 + 60;
  }

  if (shot === 'play') {
    stagePlay(7);
  } else if (shot === 'boss') {
    startRun('normal');
    st.wave = 4;
    SIEGE.startWave(st); // wave 5: escorts + Siege Core
    SIEGE.stageBoss(st);
    simulate(2.5);
    st.player.x = 560;
    st.player.y = 480;
  } else if (shot === 'upgrade') {
    startRun('normal');
    SIEGE.addXp(st, SIEGE.xpNeed(1));
    st.screen = 'upgrade';
  } else if (shot === 'over') {
    startRun('normal');
    st.score = 2840;
    st.kills = 37;
    st.wave = 3;
    st.stats.hull = 1;
    SIEGE.damagePlayer(st, 999, st.player.x, st.player.y - 10);
  }

  // --- Main loop ------------------------------------------------------------
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard < 5) {
      SIEGE.update(st, STEP, SIEGE.input);
      // Level-up offer pauses the simulation.
      if (st.offer && st.screen === 'playing') st.screen = 'upgrade';
      acc -= STEP;
      guard++;
    }
    if (guard === 5) acc = 0;
    // Touch buttons only belong to live play: hide them on the upgrade
    // screen (and title/pause/over) so they never cover the skill cards.
    touchUI.classList.toggle('visible', st.screen === 'playing');
    SIEGE.render(ctx, st, now / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Debug / QA handle: tests read live state without touching the DOM.
  window.__NEON_QA__ = {
    state: function () {
      var p = st.player;
      return {
        screen: st.screen,
        wave: st.wave,
        score: st.score,
        kills: st.kills,
        level: st.level,
        xp: st.xp,
        xpNeed: st.xpNeed,
        ulti: Math.round(st.ulti),
        laser: !!st.laser,
        hull: Math.ceil(st.stats.hull),
        weapon: p.weapon,
        ammo: p.mags[p.weapon].ammo,
        reload: +(p.mags[p.weapon].reload || 0).toFixed(2),
        enemies: st.enemies.length,
        bullets: st.bullets.length,
        offer: st.offer ? st.offer.map(function (s) { return s.id; }) : null,
      };
    },
    start: function (diff) { startRun(diff || 'normal'); },
    damage: function (n) { SIEGE.damagePlayer(st, n, st.player.x, st.player.y - 10); },
    chargeUlti: function () { st.ulti = 100; },
  };
})();
