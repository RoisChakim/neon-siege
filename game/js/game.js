// NEON SIEGE — game.js (part 1). Run state, spawning, weapons and skills.
// The simulation only: drawing lives in render.js, the loop in main.js.

(function () {
  'use strict';

  var SIEGE = window.SIEGE;
  var FIELD = SIEGE.FIELD;
  var clamp = SIEGE.clamp;

  function freshMags() {
    var mags = {};
    SIEGE.WEAPON_ORDER.forEach(function (id) {
      mags[id] = { ammo: SIEGE.WEAPONS[id].ammo, reload: 0 };
    });
    return mags;
  }

  function freshStats(diff) {
    return {
      dmgMul: 1, rateMul: 1, extraShots: 0, extraPierce: 0,
      aimMul: 1, xpMul: 1, drones: 0, rockets: 0,
      maxHull: SIEGE.DIFFICULTY[diff].hull,
      hull: SIEGE.DIFFICULTY[diff].hull,
    };
  }

  SIEGE.newRun = function (difficulty) {
    difficulty = SIEGE.DIFFICULTY[difficulty] ? difficulty : 'normal';
    var stats = freshStats(difficulty);
    return {
      screen: 'playing',
      difficulty: difficulty,
      time: 0,
      wave: 0,
      waveKills: 0,
      waveTotal: 0,
      spawnQueue: [],
      spawnTimer: 0,
      score: 0,
      kills: 0,
      level: 1,
      xp: 0,
      xpNeed: SIEGE.xpNeed(1),
      stats: stats,
      player: {
        x: FIELD.w / 2, y: FIELD.h / 2 + 80,
        vx: 0, vy: 0, angle: -Math.PI / 2,
        speed: 265, invuln: 0,
        dashCd: 0, dashTime: 0, dashDx: 0, dashDy: 1,
        fireCd: 0,
        weapon: 'pulse',
        mags: freshMags(),
      },
      bullets: [],
      enemyBullets: [],
      enemies: [],
      drones: [],
      rocketCd: 0,
      particles: [],
      floaters: [],
      pickups: [],
      offer: null,
      banner: null,
      bannerT: 0,
      shake: 0,
      ulti: 0, // 0-100; fills as you shoot, spend it on the weapon's ulti
      laser: null, // { t, angle } while the Pulse laser is live
      lanceFx: null, // { angle, t, max } fading Mega Lance visual
      over: null,
      best: 0,
    };
  };

  // --- Spawning -----------------------------------------------------------

  SIEGE.startWave = function (st, rng) {
    rng = rng || Math.random;
    st.wave += 1;
    st.waveKills = 0;
    st.spawnQueue = SIEGE.waveComp(st.wave);
    st.waveTotal = st.spawnQueue.length;
    st.spawnTimer = 0.4;
    var isBoss = st.wave % 5 === 0;
    st.banner = isBoss
      ? 'WAVE ' + st.wave + ' — SIEGE CORE'
      : 'WAVE ' + st.wave + ' / TANPA BATAS';
    st.bannerT = 2.2;
    if (isBoss) SIEGE.audio.boss(); else SIEGE.audio.wave();
  };

  // Screenshot staging: place the boss mid-arena with escorts already in,
  // so the boss scene reads at a glance instead of waiting on the spawn queue.
  SIEGE.stageBoss = function (st) {
    var diff = SIEGE.DIFFICULTY[st.difficulty];
    function mk(kind, x, y) {
      var def = SIEGE.ENEMIES[kind];
      var diff = SIEGE.DIFFICULTY[st.difficulty];
      var hp = Math.round(SIEGE.enemyHp(kind, st.wave) * diff.enemyHp);
      st.enemies.push({
        kind: kind, x: x, y: y, vx: 0, vy: 0,
        hp: hp, maxHp: hp,
        speed: def.speed + def.speedPerWave * (st.wave - 1),
        r: def.r, dmg: SIEGE.enemyDmg(kind, st.wave) * diff.enemyDmg,
        xp: def.xp, score: def.score, color: def.color,
        t: Math.random() * 10, flash: 0, burstCd: 2.5,
      });
    }
    st.spawnQueue = [];
    mk('boss', 950, 250);
    mk('tank', 760, 180);
    mk('tank', 820, 430);
    mk('drone', 1080, 390);
    mk('weaver', 700, 330);
    st.waveKills = 8; // escorts already down
    st.waveTotal = 13;
  };

  // --- Weapons ------------------------------------------------------------

  SIEGE.weaponDef = function (st) {
    return SIEGE.WEAPONS[st.player.weapon];
  };

  SIEGE.tryFire = function (st) {
    var p = st.player;
    var def = SIEGE.weaponDef(st);
    var mag = p.mags[p.weapon];
    if (p.fireCd > 0 || mag.reload > 0 || mag.ammo <= 0) return;
    var aim = SIEGE.nearestEnemy(st, p.x, p.y, 520 * st.stats.aimMul);
    var baseAngle = aim
      ? Math.atan2(aim.y - p.y, aim.x - p.x)
      : p.angle;
    p.angle = baseAngle;
    var pellets = def.pellets + st.stats.extraShots;
    var i;
    for (i = 0; i < pellets; i++) {
      var spread = (i - (pellets - 1) / 2) * (def.spread / Math.max(1, pellets - 1) || 0);
      // Scatter uses a wide fan; other weapons keep a tight grouping.
      var a = def.id === 'scatter'
        ? baseAngle + (i - (pellets - 1) / 2) * (def.spread * 2 / Math.max(1, pellets - 1))
        : baseAngle + (Math.random() - 0.5) * def.spread * 2;
      st.bullets.push({
        x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
        vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed,
        dmg: def.damage * st.stats.dmgMul,
        pierce: def.pierce + st.stats.extraPierce,
        r: def.size, life: 1.1, color: def.color, kind: def.id,
      });
    }
    mag.ammo -= 1;
    p.fireCd = 1 / (def.rate * st.stats.rateMul);
    // Every shot feeds the ultimate gauge.
    st.ulti = Math.min(100, st.ulti + 1.2);
    if (mag.ammo <= 0) {
      mag.reload = def.reload;
      SIEGE.audio.reload();
    }
    SIEGE.audio.shoot(def.id);
    st.particles.push({
      x: p.x + Math.cos(baseAngle) * 22, y: p.y + Math.sin(baseAngle) * 22,
      vx: 0, vy: 0, life: 0.08, max: 0.08, r: 7, color: def.color, kind: 'flash',
    });
  };

  SIEGE.cycleWeapon = function (st) {
    var order = SIEGE.WEAPON_ORDER;
    var i = order.indexOf(st.player.weapon);
    st.player.weapon = order[(i + 1) % order.length];
    st.player.fireCd = Math.max(st.player.fireCd, 0.08);
    SIEGE.audio.click();
  };

  SIEGE.selectWeapon = function (st, id) {
    if (SIEGE.WEAPONS[id] && st.player.weapon !== id) {
      st.player.weapon = id;
      SIEGE.audio.click();
    }
  };

  SIEGE.manualReload = function (st) {
    var p = st.player;
    var mag = p.mags[p.weapon];
    var def = SIEGE.weaponDef(st);
    if (mag.reload <= 0 && mag.ammo < def.ammo) {
      mag.reload = def.reload;
      SIEGE.audio.reload();
    }
  };

  SIEGE.nearestEnemy = function (st, x, y, maxDist) {
    var best = null, bestD = maxDist * maxDist;
    for (var i = 0; i < st.enemies.length; i++) {
      var e = st.enemies[i];
      var d = SIEGE.dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };

  // --- XP, levels and skills ----------------------------------------------

  SIEGE.addXp = function (st, amount) {
    st.xp += amount;
    // One offer at a time; surplus XP waits for the next pickup.
    if (st.xp >= st.xpNeed) {
      st.xp -= st.xpNeed;
      st.level += 1;
      st.xpNeed = SIEGE.xpNeed(st.level);
      st.offer = SIEGE.rollOffer(st);
      SIEGE.audio.levelup();
    }
  };

  SIEGE.rollOffer = function (st) {
    var pool = SIEGE.SKILLS.slice();
    var out = [];
    while (out.length < 3 && pool.length) {
      var i = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  };

  SIEGE.applySkill = function (st, skill) {
    skill.apply(st.stats);
    // Drones are materialized from the stat when first gained.
    while (st.drones.length < st.stats.drones) {
      st.drones.push({ angle: Math.random() * Math.PI * 2, fireCd: 0 });
    }
    st.offer = null;
    st.screen = 'playing';
  };

  // --- Damage ---------------------------------------------------------------

  function burst(st, x, y, color, n, speed) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = speed * (0.4 + Math.random() * 0.8);
      st.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.3, max: 0.65,
        r: 2 + Math.random() * 3, color: color, kind: 'spark',
      });
    }
  }
  SIEGE.burst = burst;

  // Ultimate: one per weapon, all instant-kill.
  //  Pulse   -> LASER: a beam that tracks the nearest enemy for 5 seconds.
  //  Scatter -> NOVA: 24 piercing projectiles in every direction.
  //  Rail    -> MEGA LANCE: one giant lance along the aim line.
  SIEGE.fireUlti = function (st) {
    if (st.screen !== 'playing' || st.ulti < 100) return false;
    st.ulti = 0;
    st.enemyBullets.length = 0;
    var w = st.player.weapon;
    var p = st.player;
    SIEGE.audio.explode(true);
    SIEGE.audio.wave();
    if (w === 'pulse') {
      st.laser = { t: 5, angle: 0 };
      st.ultiLock = true;
      st.floaters.push({ x: FIELD.w / 2, y: FIELD.h / 2 - 90, text: 'LASER!', life: 1.4, max: 1.4, color: '#46d4ff' });
    } else if (w === 'scatter') {
      for (var i = 0; i < 24; i++) {
        var a = (i / 24) * Math.PI * 2;
        st.bullets.push({
          x: p.x, y: p.y,
          vx: Math.cos(a) * 720, vy: Math.sin(a) * 720,
          r: 5, dmg: 9999, pierce: 99, color: '#ffd166', from: 'player', life: 1.6,
        });
      }
      st.shake = 0.4;
      st.floaters.push({ x: FIELD.w / 2, y: FIELD.h / 2 - 90, text: 'NOVA!', life: 1.4, max: 1.4, color: '#ffd166' });
    } else {
      var aim = SIEGE.nearestEnemy(st, p.x, p.y, 1200);
      var ang = aim ? Math.atan2(aim.y - p.y, aim.x - p.x) : 0;
      var dx = Math.cos(ang), dy = Math.sin(ang);
      st.lanceFx = { angle: ang, t: 0.45, max: 0.45 };
      st.shake = 0.5;
      st.ultiLock = true;
      for (var j = 0; j < st.enemies.length; j++) {
        var e = st.enemies[j];
        var rx = e.x - p.x, ry = e.y - p.y;
        var along = rx * dx + ry * dy;
        var perp = Math.abs(rx * dy - ry * dx);
        if (along > -20 && along < 1100 && perp < 40 + e.r) e.hp = 0;
      }
      for (var k = st.enemies.length - 1; k >= 0; k--) {
        if (st.enemies[k].hp <= 0 && !st.enemies[k].dead) SIEGE.killEnemy(st, st.enemies[k]);
      }
      st.enemies = st.enemies.filter(function (x) { return !x.dead; });
      st.ultiLock = false;
      st.floaters.push({ x: FIELD.w / 2, y: FIELD.h / 2 - 90, text: 'MEGA LANCE!', life: 1.4, max: 1.4, color: '#ff4d6d' });
    }
    return true;
  };

  SIEGE.killEnemy = function (st, e) {
    e.dead = true;
    st.kills += 1;
    st.waveKills += 1;
    st.score += e.score;
    burst(st, e.x, e.y, e.color, e.kind === 'boss' ? 42 : 14, 260);
    SIEGE.audio.explode(e.kind === 'boss' || e.kind === 'tank');
    st.floaters.push({ x: e.x, y: e.y - 10, text: '+' + e.score, life: 0.9, max: 0.9, color: '#ffd166' });
    // XP lands the moment the enemy dies: amount by kind, growing with the
    // wave (difficulty), multiplied by the run's XP bonus.
    var gain = Math.round(SIEGE.enemyXp(e.kind, st.wave) * st.stats.xpMul);
    SIEGE.addXp(st, gain);
    if (!st.ultiLock) st.ulti = Math.min(100, st.ulti + 5);
    if (e.kind === 'splitter') {
      for (var i = 0; i < 2; i++) {
        var m = SIEGE.ENEMIES.mite;
        var diff = SIEGE.DIFFICULTY[st.difficulty];
        var hp = Math.round(SIEGE.enemyHp('mite', st.wave) * diff.enemyHp);
        st.enemies.push({
          kind: 'mite', x: e.x + (i ? 12 : -12), y: e.y,
          vx: 0, vy: 0, hp: hp, maxHp: hp,
          speed: m.speed, r: m.r,
          dmg: SIEGE.enemyDmg('mite', st.wave) * diff.enemyDmg,
          xp: m.xp, score: m.score,
          color: m.color, t: Math.random() * 10, flash: 0, burstCd: 0,
        });
      }
    }
    // Rare hull cell drop.
    if (Math.random() < 0.06) {
      st.pickups.push({ x: e.x, y: e.y, kind: 'hull', amount: 20 });
    }
    if (e.kind === 'boss') {
      st.shake = 0.5;
    }
  };

  SIEGE.damagePlayer = function (st, dmg, fromX, fromY) {
    var p = st.player;
    if (p.invuln > 0 || st.screen !== 'playing') return;
    p.invuln = 0.8;
    st.stats.hull -= dmg;
    SIEGE.audio.hurt();
    burst(st, p.x, p.y, '#ff5d5d', 10, 200);
    st.shake = Math.max(st.shake, 0.25);
    var dx = p.x - fromX, dy = p.y - fromY;
    var len = Math.hypot(dx, dy) || 1;
    p.vx += (dx / len) * 260;
    p.vy += (dy / len) * 260;
    if (st.stats.hull <= 0) {
      st.stats.hull = 0;
      SIEGE.gameOver(st);
    }
  };

  SIEGE.gameOver = function (st) {
    st.screen = 'gameover';
    var best = 0;
    var isBest = false;
    try {
      best = Number(localStorage.getItem('neon-siege-best') || 0);
      if (st.score > best) {
        isBest = true;
        best = st.score;
        localStorage.setItem('neon-siege-best', String(best));
      }
    } catch (e) {}
    st.best = best;
    st.over = {
      score: st.score, wave: st.wave, kills: st.kills,
      level: st.level, best: best, isBest: isBest,
    };
    burst(st, st.player.x, st.player.y, '#46d4ff', 46, 340);
    SIEGE.audio.explode(true);
  };
})();

// NEON SIEGE — game.js (part 2). The per-frame simulation.

(function () {
  'use strict';

  var SIEGE = window.SIEGE;
  var FIELD = SIEGE.FIELD;
  var clamp = SIEGE.clamp;

  SIEGE.dash = function (st) {
    var p = st.player;
    if (st.screen !== 'playing' || p.dashCd > 0) return;
    var mv = SIEGE.input.moveVector();
    var dx = mv.x, dy = mv.y;
    if (dx === 0 && dy === 0) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
    var len = Math.hypot(dx, dy) || 1;
    p.dashDx = dx / len; p.dashDy = dy / len;
    p.dashTime = 0.18;
    p.dashCd = 2.2;
    p.invuln = Math.max(p.invuln, 0.35);
    SIEGE.audio.dash();
  };

  function stepPlayer(st, dt, input) {
    var p = st.player;
    var mv = input.moveVector();
    var speed = p.speed;
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      p.vx = p.dashDx * 640;
      p.vy = p.dashDy * 640;
    } else {
      p.vx = mv.x * speed;
      p.vy = mv.y * speed;
    }
    p.x = clamp(p.x + p.vx * dt, 20, FIELD.w - 20);
    p.y = clamp(p.y + p.vy * dt, 20, FIELD.h - 20);
    if (mv.x !== 0 || mv.y !== 0) p.angle = Math.atan2(mv.y, mv.x);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.fireCd > 0) p.fireCd -= dt;

    // Reload timers run per weapon, even while another weapon is selected.
    SIEGE.WEAPON_ORDER.forEach(function (id) {
      var mag = p.mags[id];
      if (mag.reload > 0) {
        mag.reload -= dt;
        if (mag.reload <= 0) {
          mag.reload = 0;
          mag.ammo = SIEGE.WEAPONS[id].ammo;
        }
      }
    });

    if (input.firing) SIEGE.tryFire(st);
  }

  function stepDrones(st, dt, input) {
    var p = st.player;
    var i, d;
    for (i = 0; i < st.drones.length; i++) {
      d = st.drones[i];
      d.angle += dt * 2.4;
      d.x = p.x + Math.cos(d.angle) * 48;
      d.y = p.y + Math.sin(d.angle) * 48;
      if (d.fireCd > 0) d.fireCd -= dt;
      if (input.firing && d.fireCd <= 0) {
        var target = SIEGE.nearestEnemy(st, d.x, d.y, 460);
        if (target) {
          var a = Math.atan2(target.y - d.y, target.x - d.x);
          st.bullets.push({
            x: d.x, y: d.y,
            vx: Math.cos(a) * 560, vy: Math.sin(a) * 560,
            dmg: 8 * st.stats.dmgMul, pierce: 0, r: 2.5,
            life: 0.9, color: '#5cf2a6', kind: 'drone',
          });
          d.fireCd = 0.5;
        }
      }
    }
    if (st.stats.rockets > 0) {
      st.rocketCd -= dt;
      if (input.firing && st.rocketCd <= 0) {
        var t = SIEGE.nearestEnemy(st, p.x, p.y, 620);
        if (t) {
          st.bullets.push({
            x: p.x, y: p.y - 10, vx: 0, vy: -420,
            dmg: 30 * st.stats.dmgMul, pierce: 99, r: 5,
            life: 2.2, color: '#ff9f43', kind: 'rocket',
            target: t, aoe: 70,
          });
          st.rocketCd = 2.2;
          SIEGE.audio.shoot('rail');
        }
      }
    }
  }

  function stepEnemies(st, dt) {
    var p = st.player;
    var i, e;
    // Spawn from the queue, staggered.
    if (st.spawnQueue.length > 0) {
      st.spawnTimer -= dt;
      if (st.spawnTimer <= 0) {
        var kind = st.spawnQueue.shift();
        var def = SIEGE.ENEMIES[kind];
        var diff = SIEGE.DIFFICULTY[st.difficulty];
        var side = Math.floor(Math.random() * 4);
        var m = 30;
        var pos;
        if (side === 0) pos = { x: Math.random() * FIELD.w, y: -m };
        else if (side === 1) pos = { x: FIELD.w + m, y: Math.random() * FIELD.h };
        else if (side === 2) pos = { x: Math.random() * FIELD.w, y: FIELD.h + m };
        else pos = { x: -m, y: Math.random() * FIELD.h };
        var hp = Math.round(SIEGE.enemyHp(kind, st.wave) * diff.enemyHp);
        st.enemies.push({
          kind: kind, x: pos.x, y: pos.y, vx: 0, vy: 0,
          hp: hp, maxHp: hp,
          speed: def.speed + def.speedPerWave * (st.wave - 1),
          r: def.r, dmg: SIEGE.enemyDmg(kind, st.wave) * diff.enemyDmg,
          xp: def.xp, score: def.score, color: def.color,
          t: Math.random() * 10, flash: 0, burstCd: 2.5,
        });
        // Later waves spawn faster.
        st.spawnTimer = kind === 'boss' ? 1.2 : Math.max(0.22, 0.42 - st.wave * 0.01);
      }
    }

    for (i = 0; i < st.enemies.length; i++) {
      e = st.enemies[i];
      if (e.flash > 0) e.flash -= dt;
      e.t += dt;
      var dx = p.x - e.x, dy = p.y - e.y;
      var len = Math.hypot(dx, dy) || 1;
      var nx = dx / len, ny = dy / len;
      if (e.kind === 'weaver') {
        var s = Math.sin(e.t * 3.2) * 0.9;
        var px = -ny * s, py = nx * s;
        e.vx = (nx + px) * e.speed;
        e.vy = (ny + py) * e.speed;
      } else if (e.kind === 'boss') {
        e.vx = nx * e.speed;
        e.vy = ny * e.speed;
        e.burstCd -= dt;
        if (e.burstCd <= 0) {
          e.burstCd = 3.2;
          var n = 12;
          for (var b = 0; b < n; b++) {
            var a = (b / n) * Math.PI * 2 + e.t;
            st.enemyBullets.push({
              x: e.x, y: e.y,
              vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
              r: 5, life: 4, dmg: e.dmg, color: '#ff2e63',
            });
          }
          SIEGE.audio.boss();
        }
      } else {
        e.vx = nx * e.speed;
        e.vy = ny * e.speed;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // Contact damage.
      if (SIEGE.dist2(e.x, e.y, p.x, p.y) < (e.r + 14) * (e.r + 14)) {
        SIEGE.damagePlayer(st, e.dmg, e.x, e.y);
        e.x -= nx * 24; e.y -= ny * 24;
      }
    }

    // Light separation so enemies do not stack into one blob.
    for (i = 0; i < st.enemies.length; i++) {
      for (var j = i + 1; j < st.enemies.length; j++) {
        var a = st.enemies[i], b = st.enemies[j];
        var ddx = b.x - a.x, ddy = b.y - a.y;
        var dd = Math.hypot(ddx, ddy);
        var min = a.r + b.r;
        if (dd > 0.01 && dd < min) {
          var push = (min - dd) / 2;
          var ux = ddx / dd, uy = ddy / dd;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
  }

  function stepBullets(st, dt) {
    var i, j, b, e;
    for (i = st.bullets.length - 1; i >= 0; i--) {
      b = st.bullets[i];
      b.life -= dt;
      if (b.kind === 'rocket' && b.target && !b.target.dead) {
        var ta = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        var ca = Math.atan2(b.vy, b.vx);
        var diff = ta - ca;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        var na = ca + clamp(diff, -3.4 * dt, 3.4 * dt);
        var sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      var dead = b.life <= 0 || b.x < -40 || b.x > FIELD.w + 40 || b.y < -40 || b.y > FIELD.h + 40;
      if (!dead) {
        for (j = 0; j < st.enemies.length; j++) {
          e = st.enemies[j];
          if (e.dead) continue;
          if (SIEGE.dist2(b.x, b.y, e.x, e.y) < (e.r + b.r) * (e.r + b.r)) {
            e.hp -= b.dmg;
            e.flash = 0.08;
            SIEGE.burst(st, b.x, b.y, b.color, 3, 120);
            if (b.kind === 'rocket') {
              // Area damage on impact.
              for (var k = 0; k < st.enemies.length; k++) {
                var o = st.enemies[k];
                if (!o.dead && SIEGE.dist2(b.x, b.y, o.x, o.y) < b.aoe * b.aoe) {
                  o.hp -= b.dmg;
                  o.flash = 0.08;
                }
              }
              SIEGE.burst(st, b.x, b.y, '#ff9f43', 18, 260);
              SIEGE.audio.explode(false);
            } else {
              SIEGE.audio.hit();
            }
            if (b.pierce > 0) { b.pierce -= 1; }
            else { dead = true; }
            break;
          }
        }
      }
      if (dead) st.bullets.splice(i, 1);
    }

    // Resolve deaths after all bullets moved, so one frame cannot double-pay.
    for (i = st.enemies.length - 1; i >= 0; i--) {
      if (st.enemies[i].hp <= 0 && !st.enemies[i].dead) {
        SIEGE.killEnemy(st, st.enemies[i]);
      }
    }
    st.enemies = st.enemies.filter(function (x) { return !x.dead; });

    for (i = st.enemyBullets.length - 1; i >= 0; i--) {
      b = st.enemyBullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      var hit = SIEGE.dist2(b.x, b.y, st.player.x, st.player.y) < (b.r + 12) * (b.r + 12);
      if (hit) SIEGE.damagePlayer(st, b.dmg, b.x - b.vx, b.y - b.vy);
      if (hit || b.life <= 0 || b.x < -30 || b.x > FIELD.w + 30 || b.y < -30 || b.y > FIELD.h + 30) {
        st.enemyBullets.splice(i, 1);
      }
    }
  }

  function stepPickups(st, dt) {
    var p = st.player;
    var i;
    for (i = st.pickups.length - 1; i >= 0; i--) {
      var pk = st.pickups[i];
      if (SIEGE.dist2(pk.x, pk.y, p.x, p.y) < 30 * 30) {
        st.stats.hull = Math.min(st.stats.maxHull, st.stats.hull + pk.amount);
        st.floaters.push({ x: pk.x, y: pk.y - 12, text: '+20 HULL', life: 0.9, max: 0.9, color: '#5cf2a6' });
        st.pickups.splice(i, 1);
      }
    }
  }

  function stepFx(st, dt) {
    var i;
    for (i = st.particles.length - 1; i >= 0; i--) {
      var pt = st.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96; pt.vy *= 0.96;
      if (pt.life <= 0) st.particles.splice(i, 1);
    }
    for (i = st.floaters.length - 1; i >= 0; i--) {
      var f = st.floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) st.floaters.splice(i, 1);
    }
    if (st.bannerT > 0) st.bannerT -= dt;
    if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 1.4);
    if (st.lanceFx) {
      st.lanceFx.t -= dt;
      if (st.lanceFx.t <= 0) st.lanceFx = null;
    }
  }

  // The LASER ulti: 5 seconds of a beam tracking the nearest enemy.
  // Everything the beam touches dies instantly.
  function stepLaser(st, dt) {
    if (!st.laser) return;
    st.laser.t -= dt;
    var p = st.player;
    var aim = SIEGE.nearestEnemy(st, p.x, p.y, 1200);
    var ang = aim ? Math.atan2(aim.y - p.y, aim.x - p.x) : st.laser.angle;
    st.laser.angle = ang;
    var dx = Math.cos(ang), dy = Math.sin(ang);
    for (var i = st.enemies.length - 1; i >= 0; i--) {
      var e = st.enemies[i];
      if (e.dead) continue;
      var rx = e.x - p.x, ry = e.y - p.y;
      var along = rx * dx + ry * dy;
      var perp = Math.abs(rx * dy - ry * dx);
      if (along > -20 && along < 1000 && perp < 18 + e.r) {
        e.hp = 0;
        SIEGE.killEnemy(st, e);
      }
    }
    st.enemies = st.enemies.filter(function (x) { return !x.dead; });
    // The beam also eats enemy bullets in its path.
    for (var j = st.enemyBullets.length - 1; j >= 0; j--) {
      var b = st.enemyBullets[j];
      var brx = b.x - p.x, bry = b.y - p.y;
      var balong = brx * dx + bry * dy;
      var bperp = Math.abs(brx * dy - bry * dx);
      if (balong > 0 && balong < 1000 && bperp < 24) st.enemyBullets.splice(j, 1);
    }
    if (st.laser.t <= 0) { st.laser = null; st.ultiLock = false; }
  }

  SIEGE.update = function (st, dt, input) {
    st.time += dt;
    stepFx(st, dt);
    if (st.screen !== 'playing') return;
    stepPlayer(st, dt, input);
    stepDrones(st, dt, input);
    stepEnemies(st, dt);
    stepBullets(st, dt);
    stepLaser(st, dt);
    stepPickups(st, dt);
    // Wave cleared: bonus, then the next wave.
    if (st.spawnQueue.length === 0 && st.enemies.length === 0 && st.screen === 'playing') {
      st.score += 500;
      st.floaters.push({
        x: FIELD.w / 2, y: FIELD.h / 2 - 60,
        text: 'WAVE CLEAR +500', life: 1.4, max: 1.4, color: '#ffd166',
      });
      SIEGE.startWave(st);
    }
  };
})();
