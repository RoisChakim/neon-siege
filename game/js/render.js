// NEON SIEGE — render.js. Every pixel the game draws: background, arena,
// enemies, HUD and the title / upgrade / pause / game-over screens.
// Screens are drawn on the canvas; their button rects are published on
// SIEGE.layout so main.js can hit-test clicks in virtual coordinates.

(function () {
  'use strict';

  var SIEGE = window.SIEGE;
  var FIELD = SIEGE.FIELD;
  var C = SIEGE.COLORS;
  var clamp = SIEGE.clamp;

  // Static starfield, seeded once so the backdrop never shimmers.
  var stars = [];
  (function () {
    var rng = SIEGE.rng(1337);
    for (var i = 0; i < 110; i++) {
      stars.push({
        x: rng() * FIELD.w, y: rng() * FIELD.h,
        r: 0.5 + rng() * 1.6, a: 0.25 + rng() * 0.6,
        tw: rng() * Math.PI * 2,
      });
    }
  })();

  SIEGE.layout = { title: null, upgrade: null, over: null };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, s, x, y, size, color, weight, align) {
    ctx.font = (weight || 600) + ' ' + size + 'px Inter, Segoe UI, Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }

  function glowCircle(ctx, x, y, r, color, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha == null ? 0.5 : alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawBackground(ctx, time) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);
    // Grid.
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= FIELD.w; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, FIELD.h); }
    for (var y = 0; y <= FIELD.h; y += 64) { ctx.moveTo(0, y); ctx.lineTo(FIELD.w, y); }
    ctx.stroke();
    // Stars, gently twinkling.
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = s.a * (0.7 + 0.3 * Math.sin(time * 1.4 + s.tw));
      ctx.fillStyle = '#cfe9ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Corner brackets, like a HUD frame.
    ctx.strokeStyle = 'rgba(70,212,255,0.35)';
    ctx.lineWidth = 2;
    var m = 26, l = 26;
    ctx.beginPath();
    ctx.moveTo(m, m + l); ctx.lineTo(m, m); ctx.lineTo(m + l, m);
    ctx.moveTo(FIELD.w - m - l, m); ctx.lineTo(FIELD.w - m, m); ctx.lineTo(FIELD.w - m, m + l);
    ctx.moveTo(FIELD.w - m, FIELD.h - m - l); ctx.lineTo(FIELD.w - m, FIELD.h - m); ctx.lineTo(FIELD.w - m - l, FIELD.h - m);
    ctx.moveTo(m + l, FIELD.h - m); ctx.lineTo(m, FIELD.h - m); ctx.lineTo(m, FIELD.h - m - l);
    ctx.stroke();
  }

  function drawShip(ctx, x, y, angle, r, color, invuln, time) {
    ctx.save();
    ctx.translate(x, y);
    if (invuln > 0 && Math.floor(time * 14) % 2 === 0) ctx.globalAlpha = 0.35;
    glowCircle(ctx, 0, 0, r * 2.6, color, 0.35);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(r + 6, 0);
    ctx.lineTo(-r * 0.8, r * 0.85);
    ctx.lineTo(-r * 0.35, 0);
    ctx.lineTo(-r * 0.8, -r * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.25, 0, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(ctx, e, time) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.flash > 0) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 18;
    } else {
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 10;
    }
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    var r = e.r;
    if (e.kind === 'drone') {
      var a = Math.atan2(e.vy, e.vx);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(r + 4, 0); ctx.lineTo(-r, r * 0.8); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r, -r * 0.8);
      ctx.closePath(); ctx.fill();
    } else if (e.kind === 'weaver') {
      ctx.rotate(e.t * 1.5);
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
      ctx.closePath(); ctx.fill();
    } else if (e.kind === 'tank') {
      ctx.rotate(e.t * 0.4);
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var an = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r);
        else ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(5,8,19,0.7)';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'splitter') {
      ctx.rotate(Math.PI / 4 + e.t * 0.8);
      ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
    } else if (e.kind === 'mite') {
      ctx.rotate(e.t * 3);
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(-r, r * 0.7); ctx.lineTo(-r, -r * 0.7);
      ctx.closePath(); ctx.fill();
    } else if (e.kind === 'boss') {
      ctx.rotate(e.t * 0.5);
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var an2 = (k / 6) * Math.PI * 2;
        if (k === 0) ctx.moveTo(Math.cos(an2) * r, Math.sin(an2) * r);
        else ctx.lineTo(Math.cos(an2) * r, Math.sin(an2) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.rotate(-e.t * 1.1);
      ctx.strokeStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Health bar for tough enemies.
    if ((e.kind === 'tank' || e.kind === 'boss' || e.kind === 'splitter') && e.hp < e.maxHp) {
      var w = e.kind === 'boss' ? 90 : 34;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }

  function drawWorld(ctx, st, time) {
    var i;
    // Pickups (hull cells).
    for (i = 0; i < st.pickups.length; i++) {
      var pk = st.pickups[i];
      ctx.save();
      ctx.translate(pk.x, pk.y);
      ctx.fillStyle = C.green;
      ctx.shadowColor = C.green; ctx.shadowBlur = 10;
      ctx.fillRect(-7, -2.5, 14, 5);
      ctx.fillRect(-2.5, -7, 5, 14);
      ctx.restore();
    }
    // Enemies.
    for (i = 0; i < st.enemies.length; i++) drawEnemy(ctx, st.enemies[i], time);
    // Enemy bullets.
    for (i = 0; i < st.enemyBullets.length; i++) {
      var eb = st.enemyBullets[i];
      glowCircle(ctx, eb.x, eb.y, eb.r * 2.4, eb.color, 0.6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(eb.x, eb.y, eb.r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    // Drones.
    for (i = 0; i < st.drones.length; i++) {
      var d = st.drones[i];
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.strokeStyle = C.green;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.green;
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Player.
    if (st.screen !== 'gameover') {
      var p = st.player;
      drawShip(ctx, p.x, p.y, p.angle, 15, C.cyan, p.invuln, time);
      if (p.dashTime > 0) {
        ctx.strokeStyle = 'rgba(70,212,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // Bullets.
    for (i = 0; i < st.bullets.length; i++) {
      var b = st.bullets[i];
      if (b.kind === 'rocket') {
        glowCircle(ctx, b.x, b.y, 14, '#ff9f43', 0.7);
        ctx.fillStyle = '#ff9f43';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.r * 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Ultimate visuals: the Pulse laser beam and the Rail Mega Lance.
    if (st.laser) {
      var la = st.laser.angle;
      var lx = st.player.x + Math.cos(la) * 1000;
      var ly = st.player.y + Math.sin(la) * 1000;
      var flick = 0.75 + Math.random() * 0.25;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(70,212,255,0.25)';
      ctx.lineWidth = 30 * flick;
      ctx.beginPath(); ctx.moveTo(st.player.x, st.player.y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 6 * flick;
      ctx.beginPath(); ctx.moveTo(st.player.x, st.player.y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.restore();
    }
    if (st.lanceFx) {
      var fa = clamp(st.lanceFx.t / st.lanceFx.max, 0, 1);
      var fx = st.player.x + Math.cos(st.lanceFx.angle) * 1100;
      var fy = st.player.y + Math.sin(st.lanceFx.angle) * 1100;
      ctx.save();
      ctx.globalAlpha = fa;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 46 * fa + 4;
      ctx.beginPath(); ctx.moveTo(st.player.x, st.player.y); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 10 * fa + 2;
      ctx.beginPath(); ctx.moveTo(st.player.x, st.player.y); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.restore();
    }
    // Particles.
    for (i = 0; i < st.particles.length; i++) {
      var pt = st.particles[i];
      var a = clamp(pt.life / pt.max, 0, 1);
      if (pt.kind === 'flash') {
        glowCircle(ctx, pt.x, pt.y, pt.r * 2.4, pt.color, a);
      } else if (pt.kind === 'ring') {
        // Expanding shockwave ring (ulti).
        var prog = 1 - clamp(pt.life / pt.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 4 * a + 1;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r * (0.4 + prog * 2.2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r * a + 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // Floating score text.
    for (i = 0; i < st.floaters.length; i++) {
      var f = st.floaters[i];
      ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
      text(ctx, f.text, f.x, f.y, 15, f.color, 700, 'center');
      ctx.globalAlpha = 1;
    }
  }

  function bar(ctx, x, y, w, h, frac, color, bg) {
    ctx.fillStyle = bg || 'rgba(255,255,255,0.14)';
    rr(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = color;
      rr(ctx, x, y, w * clamp(frac, 0, 1), h, h / 2);
      ctx.fill();
    }
  }

  function drawHUD(ctx, st) {
    var p = st.player;
    var def = SIEGE.WEAPONS[p.weapon];
    var mag = p.mags[p.weapon];
    // Top bar.
    ctx.fillStyle = 'rgba(5,8,19,0.72)';
    ctx.fillRect(0, 0, FIELD.w, 64);
    ctx.strokeStyle = 'rgba(70,212,255,0.16)';
    ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(FIELD.w, 64); ctx.stroke();
    text(ctx, 'N / S', 28, 26, 20, C.cyan, 800);
    text(ctx, 'NEON SIEGE', 78, 22, 15, C.white, 700);
    text(ctx, 'ENDLESS EVOLUTION v2.5 · 3 SENJATA + RELOAD', 78, 42, 10, C.muted, 600);
    // Wave center.
    var waveLabel = 'WAVE ' + String(st.wave).padStart(2, '0') + ' / ENDLESS';
    text(ctx, waveLabel, FIELD.w / 2, 22, 15, C.white, 700, 'center');
    text(ctx, 'PESAWAT ' + st.waveKills + ' / ' + st.waveTotal, FIELD.w / 2, 42, 11, C.cyan, 600, 'center');
    bar(ctx, FIELD.w / 2 - 90, 52, 180, 4, st.waveTotal ? st.waveKills / st.waveTotal : 0, C.cyan);
    // Score right.
    text(ctx, 'TOTAL SCORE', FIELD.w - 28, 20, 10, C.muted, 600, 'right');
    text(ctx, String(st.score).padStart(6, '0'), FIELD.w - 28, 40, 22, C.white, 800, 'right');
    text(ctx, 'LV ' + st.level + ' · ' + (st.stats.drones + st.stats.rockets) + ' SKILL', FIELD.w - 220, 22, 10, C.gold, 600, 'right');
    bar(ctx, FIELD.w - 330, 34, 110, 5, st.xp / st.xpNeed, C.gold);
    text(ctx, 'XP ' + st.xp + ' / ' + st.xpNeed, FIELD.w - 220, 42, 10, C.muted, 600, 'right');

    // Bottom bar.
    ctx.fillStyle = 'rgba(5,8,19,0.72)';
    ctx.fillRect(0, FIELD.h - 56, FIELD.w, 56);
    ctx.strokeStyle = 'rgba(70,212,255,0.16)';
    ctx.beginPath(); ctx.moveTo(0, FIELD.h - 56); ctx.lineTo(FIELD.w, FIELD.h - 56); ctx.stroke();
    text(ctx, 'HULL', 28, FIELD.h - 40, 11, C.muted, 700);
    text(ctx, Math.ceil(st.stats.hull) + ' / ' + st.stats.maxHull, 200, FIELD.h - 40, 11, C.white, 700, 'right');
    bar(ctx, 28, FIELD.h - 30, 172, 8, st.stats.hull / st.stats.maxHull, st.stats.hull < st.stats.maxHull * 0.3 ? C.danger : C.cyan);
    // Weapon.
    text(ctx, def.name, 232, FIELD.h - 40, 11, def.color, 700);
    var reloadTxt = mag.reload > 0 ? 'RELOAD ' + mag.reload.toFixed(1) + 's' : mag.ammo + ' / ' + def.ammo;
    text(ctx, reloadTxt, 400, FIELD.h - 40, 11, mag.reload > 0 ? C.gold : C.white, 700, 'right');
    bar(ctx, 232, FIELD.h - 30, 168, 8, mag.ammo / def.ammo, mag.reload > 0 ? C.gold : def.color);
    // Dash.
    text(ctx, 'DASH / SPACE', 432, FIELD.h - 40, 11, C.muted, 700);
    text(ctx, p.dashCd <= 0 ? 'READY' : p.dashCd.toFixed(1) + 's', 600, FIELD.h - 40, 11, p.dashCd <= 0 ? C.green : C.muted, 700, 'right');
    bar(ctx, 432, FIELD.h - 30, 168, 8, p.dashCd <= 0 ? 1 : 1 - p.dashCd / 2.2, C.green);
    // Ultimate gauge: fills as you shoot; E / ULTI spends it on the
    // current weapon's ulti (LASER / NOVA / MEGA LANCE).
    var ultiName = SIEGE.ULTI_NAMES[p.weapon];
    var ultiReady = st.ulti >= 100;
    var ultiVal, ultiFrac, ultiColor;
    if (st.laser) {
      ultiVal = 'LASER ' + Math.ceil(st.laser.t) + 's';
      ultiFrac = st.laser.t / 5;
      ultiColor = C.cyan;
    } else if (ultiReady) {
      ultiVal = ultiName + ' READY!';
      ultiFrac = 1;
      ultiColor = C.gold;
    } else {
      ultiVal = Math.floor(st.ulti) + '%';
      ultiFrac = st.ulti / 100;
      ultiColor = '#b8860b';
    }
    text(ctx, 'ULTI / E', 632, FIELD.h - 40, 11, (ultiReady || st.laser) ? ultiColor : C.muted, 700);
    text(ctx, ultiVal, 800, FIELD.h - 40, 11, (ultiReady || st.laser) ? ultiColor : C.white, 700, 'right');
    bar(ctx, 632, FIELD.h - 30, 168, 8, ultiFrac, ultiColor);
    // Hints.
    text(ctx, 'WASD GERAK · TAHAN TEMBAK · Q GANTI · R RELOAD', FIELD.w - 28, FIELD.h - 28, 10, C.muted, 600, 'right');

    // Wave banner.
    if (st.banner && st.bannerT > 0) {
      ctx.globalAlpha = clamp(st.bannerT, 0, 1);
      var bw = 460;
      ctx.fillStyle = 'rgba(5,8,19,0.85)';
      rr(ctx, FIELD.w / 2 - bw / 2, 150, bw, 76, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,212,255,0.4)';
      ctx.stroke();
      text(ctx, st.banner, FIELD.w / 2, 178, 19, C.white, 800, 'center');
      text(ctx, st.wave % 5 === 0 ? 'Hancurkan Siege Core!' : 'Target ' + st.waveTotal + ' pesawat', FIELD.w / 2, 204, 12, C.muted, 600, 'center');
      ctx.globalAlpha = 1;
    }

    // Touch joystick visual.
    var joy = SIEGE.input.joy;
    if (joy.active) {
      ctx.strokeStyle = 'rgba(70,212,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(70,212,255,0.35)';
      ctx.beginPath(); ctx.arc(joy.ox + joy.dx * 34, joy.oy + joy.dy * 34, 24, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawTitle(ctx, time) {
    // Animated radar rings behind the hero art.
    var cx = FIELD.w * 0.68, cy = FIELD.h * 0.52;
    for (var i = 0; i < 3; i++) {
      ctx.strokeStyle = 'rgba(70,212,255,' + (0.22 - i * 0.06) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 90 + i * 55 + Math.sin(time * 0.8 + i) * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Hero ship + escorts, drawn from the same shapes as the game.
    drawShip(ctx, cx - 130, cy + 40, -0.5, 22, C.cyan, 0, time);
    ctx.save();
    ctx.translate(cx + 60, cy - 60);
    ctx.rotate(time * 0.4);
    ctx.fillStyle = C.magenta;
    ctx.shadowColor = C.magenta; ctx.shadowBlur = 16;
    ctx.beginPath();
    for (var k = 0; k < 6; k++) {
      var an = (k / 6) * Math.PI * 2;
      if (k === 0) ctx.moveTo(Math.cos(an) * 46, Math.sin(an) * 46);
      else ctx.lineTo(Math.cos(an) * 46, Math.sin(an) * 46);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();

    text(ctx, 'A ONE-PILOT SURVIVAL MISSION', 84, 150, 13, C.cyan, 700);
    ctx.strokeStyle = 'rgba(70,212,255,0.4)';
    ctx.beginPath(); ctx.moveTo(84, 168); ctx.lineTo(400, 168); ctx.stroke();
    text(ctx, 'NEON', 80, 260, 92, C.white, 800);
    text(ctx, 'SIEGE', 80, 348, 92, C.cyan, 800);
    text(ctx, 'ENDLESS EVOLUTION', 84, 412, 20, C.white, 700);
    text(ctx, 'Endless survival. Build your hero. Survive the siege.', 84, 452, 15, C.muted, 600);

    var btn = { x: 84, y: 500, w: 320, h: 64 };
    ctx.fillStyle = C.cyan;
    rr(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fill();
    text(ctx, 'ENTER THE ARENA  ›', btn.x + btn.w / 2, btn.y + btn.h / 2 + 1, 19, '#04121f', 800, 'center');

    var d1 = { x: 84, y: 584, w: 152, h: 44 };
    var d2 = { x: 248, y: 584, w: 152, h: 44 };
    ctx.fillStyle = 'rgba(70,212,255,0.16)';
    ctx.strokeStyle = C.cyan;
    rr(ctx, d1.x, d1.y, d1.w, d1.h, 8); ctx.fill(); ctx.stroke();
    text(ctx, '1  SANTAI', d1.x + d1.w / 2, d1.y + d1.h / 2, 13, C.white, 700, 'center');
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    rr(ctx, d2.x, d2.y, d2.w, d2.h, 8); ctx.fill(); ctx.stroke();
    text(ctx, '2  NORMAL', d2.x + d2.w / 2, d2.y + d2.h / 2, 13, C.white, 700, 'center');

    text(ctx, 'WASD GERAK · TAHAN TEMBAK · Q GANTI · R RELOAD', 84, 668, 11, C.muted, 600);
    text(ctx, 'UNLIMITED WAVES · BOSS SETIAP 5 WAVE', FIELD.w - 84, 668, 11, C.muted, 600, 'right');
    text(ctx, 'OFFLINE ARCADE · SINGLE PLAYER', FIELD.w - 84, 60, 11, C.muted, 600, 'right');
    text(ctx, 'POWER GRID / 01', 84, 60, 11, C.white, 700);

    SIEGE.layout.title = { enter: btn, santai: d1, normal: d2 };
  }

  function drawUpgrade(ctx, st) {
    ctx.fillStyle = 'rgba(3,5,14,0.78)';
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);
    var portrait = SIEGE.view && SIEGE.view.portrait;
    text(ctx, 'LEVEL ' + st.level + ' — PILIH SKILL', FIELD.w / 2, portrait ? 118 : 130, portrait ? 20 : 24, C.gold, 800, 'center');
    text(ctx, 'Pertempuran dijeda. Pilih satu untuk lanjut.', FIELD.w / 2, portrait ? 146 : 164, portrait ? 12 : 13, C.muted, 600, 'center');
    var cards = [];
    // Portrait phones get SMALL cards stacked vertically (about a third of
    // the field wide, ~40% tall in total); landscape keeps the 3-across row.
    // The hit rects follow the same layout.
    var cw = portrait ? 460 : 300;
    var ch = portrait ? 96 : 220;
    var gap = portrait ? 12 : 28;
    var y0 = portrait ? 176 : 210;
    var x0 = portrait ? (FIELD.w - cw) / 2 : (FIELD.w - (cw * 3 + gap * 2)) / 2;
    st.offer.forEach(function (skill, i) {
      var x = portrait ? x0 : x0 + i * (cw + gap);
      var y = portrait ? y0 + i * (ch + gap) : y0;
      ctx.fillStyle = '#0a0f24';
      ctx.strokeStyle = 'rgba(255,209,102,0.55)';
      ctx.lineWidth = 1.5;
      rr(ctx, x, y, cw, ch, 14);
      ctx.fill(); ctx.stroke();
      if (portrait) {
        // Compact row: icon left, name + desc right.
        text(ctx, skill.icon, x + 44, y + ch / 2, 22, C.gold, 700, 'center');
        text(ctx, skill.name, x + 80, y + 36, 15, C.white, 700);
        ctx.fillStyle = C.muted;
        ctx.font = '600 11px Inter, Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'left';
        wrapText(ctx, skill.desc, x + 80, y + 60, cw - 108, 15);
        text(ctx, 'TEKAN ' + (i + 1), x + cw - 14, y + ch - 16, 9, C.cyan, 700, 'right');
      } else {
        text(ctx, skill.icon, x + cw / 2, y + 56, 40, C.gold, 700, 'center');
        text(ctx, skill.name, x + cw / 2, y + 116, 19, C.white, 700, 'center');
        ctx.fillStyle = C.muted;
        ctx.font = '600 13px Inter, Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        wrapText(ctx, skill.desc, x + cw / 2, y + 152, cw - 44, 19);
        text(ctx, 'TEKAN ' + (i + 1), x + cw / 2, y + ch - 26, 11, C.cyan, 700, 'center');
      }
      cards.push({ x: x, y: y, w: cw, h: ch, skill: skill });
    });
    SIEGE.layout.upgrade = cards;
  }

  function wrapText(ctx, str, x, y, maxW, lh) {
    var words = str.split(' ');
    var line = '';
    var yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = words[i];
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function drawPause(ctx) {
    ctx.fillStyle = 'rgba(3,5,14,0.7)';
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);
    text(ctx, 'JEDA', FIELD.w / 2, FIELD.h / 2 - 20, 44, C.white, 800, 'center');
    text(ctx, 'P / Esc untuk lanjut · M bisu · R mulai ulang', FIELD.w / 2, FIELD.h / 2 + 30, 14, C.muted, 600, 'center');
  }

  function drawGameOver(ctx, st) {
    ctx.fillStyle = 'rgba(3,5,14,0.82)';
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);
    var o = st.over || { score: 0, wave: 0, kills: 0, level: 1, best: 0, isBest: false };
    text(ctx, 'SIEGE BERAKHIR', FIELD.w / 2, 190, 40, C.magenta, 800, 'center');
    if (o.isBest) text(ctx, '★ SKOR TERBAIK BARU ★', FIELD.w / 2, 236, 15, C.gold, 700, 'center');
    text(ctx, String(o.score).padStart(6, '0'), FIELD.w / 2, 310, 56, C.white, 800, 'center');
    text(ctx, 'SKOR', FIELD.w / 2, 348, 12, C.muted, 600, 'center');
    var row = 'WAVE ' + o.wave + '   ·   ' + o.kills + ' MUSUH   ·   LEVEL ' + o.level + '   ·   TERBAIK ' + o.best;
    text(ctx, row, FIELD.w / 2, 396, 14, C.muted, 600, 'center');
    var btn = { x: FIELD.w / 2 - 150, y: 450, w: 300, h: 60 };
    ctx.fillStyle = C.cyan;
    rr(ctx, btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fill();
    text(ctx, 'MAIN LAGI  (R)', btn.x + btn.w / 2, btn.y + btn.h / 2 + 1, 17, '#04121f', 800, 'center');
    text(ctx, 'Enter the arena, pilot. The siege never ends.', FIELD.w / 2, 560, 13, C.muted, 600, 'center');
    SIEGE.layout.over = { restart: btn };
  }

  SIEGE.render = function (ctx, st, time) {
    ctx.save();
    if (st.shake > 0) {
      var s = st.shake * 8;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    drawBackground(ctx, time);
    if (st.screen === 'title') {
      drawTitle(ctx, time);
    } else {
      drawWorld(ctx, st, time);
      drawHUD(ctx, st);
      if (st.screen === 'upgrade' && st.offer) drawUpgrade(ctx, st);
      else if (st.screen === 'paused') drawPause(ctx);
      else if (st.screen === 'gameover') drawGameOver(ctx, st);
    }
    ctx.restore();
  };
})();
