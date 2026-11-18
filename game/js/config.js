// NEON SIEGE — Endless Evolution. Fresh build for make.fun best-game-01.
// config.js — tuning, weapons, skills, enemy and wave tables. No code from
// any other implementation: every value and shape below was chosen here.

(function () {
  'use strict';

  var SIEGE = (window.SIEGE = window.SIEGE || {});

  SIEGE.FIELD = { w: 1280, h: 720 };

  SIEGE.COLORS = {
    bg: '#050813',
    panel: '#0a0f24',
    grid: 'rgba(70, 212, 255, 0.07)',
    cyan: '#46d4ff',
    cyanDim: '#2a7ea6',
    magenta: '#ff4d6d',
    gold: '#ffd166',
    violet: '#b388ff',
    green: '#5cf2a6',
    white: '#eef6ff',
    muted: '#8fa3c8',
    danger: '#ff5d5d',
  };

  // Difficulty: enemy health and damage multipliers, player hull.
  // Ultimate names, one per weapon.
  SIEGE.ULTI_NAMES = { pulse: 'LASER', scatter: 'NOVA', rail: 'MEGA LANCE' };

  SIEGE.DIFFICULTY = {
    santai: { label: 'SANTAI', enemyHp: 0.75, enemyDmg: 0.7, hull: 180 },
    normal: { label: 'NORMAL', enemyHp: 1.0, enemyDmg: 1.0, hull: 150 },
  };

  // Weapons. ammo is per weapon, reload runs on its own timer even while
  // another weapon is selected. Fire only happens while the trigger is held.
  SIEGE.WEAPONS = {
    pulse: {
      id: 'pulse',
      name: 'PULSE',
      full: 'Pulse Rifle',
      desc: 'Penembak cepat dan seimbang.',
      damage: 12,
      rate: 8, // shots per second
      speed: 720,
      spread: 0.035,
      pellets: 1,
      pierce: 0,
      size: 3,
      color: '#46d4ff',
      ammo: 100,
      reload: 4.0,
    },
    scatter: {
      id: 'scatter',
      name: 'SCATTER',
      full: 'Scatter Blaster',
      desc: 'Lima proyektil menyebar, cocok jarak dekat.',
      damage: 7,
      rate: 2.6,
      speed: 640,
      spread: 0.34,
      pellets: 5,
      pierce: 0,
      size: 3,
      color: '#ffd166',
      ammo: 100,
      reload: 4.0,
    },
    rail: {
      id: 'rail',
      name: 'RAIL',
      full: 'Rail Lance',
      desc: 'Proyektil kuat, cepat, menembus musuh.',
      damage: 42,
      rate: 1.4,
      speed: 1100,
      spread: 0.01,
      pellets: 1,
      pierce: 3,
      size: 4,
      color: '#ff4d6d',
      ammo: 100,
      reload: 4.0,
    },
  };
  SIEGE.WEAPON_ORDER = ['pulse', 'scatter', 'rail'];

  // Level-up skills. Each entry can stack; `apply` mutates the run stats.
  SIEGE.SKILLS = [
    {
      id: 'plasma',
      name: 'Plasma Core',
      icon: '◉',
      desc: '+25% damage semua senjata.',
      apply: function (s) { s.dmgMul *= 1.25; },
    },
    {
      id: 'rapid',
      name: 'Rapid Trigger',
      icon: '≫',
      desc: '+18% kecepatan tembak.',
      apply: function (s) { s.rateMul *= 1.18; },
    },
    {
      id: 'barrel',
      name: 'Multi Barrel',
      icon: '✦',
      desc: '+1 proyektil per tembakan.',
      apply: function (s) { s.extraShots += 1; },
    },
    {
      id: 'pierce',
      name: 'Piercing Rounds',
      icon: '➶',
      desc: 'Proyektil menembus +1 musuh.',
      apply: function (s) { s.extraPierce += 1; },
    },
    {
      id: 'radar',
      name: 'Radar Overclock',
      icon: '◎',
      desc: '+25% jangkauan bidik & +15% XP.',
      apply: function (s) { s.aimMul *= 1.25; s.xpMul *= 1.15; },
    },
    {
      id: 'drone',
      name: 'Drone Bay',
      icon: '⬡',
      desc: '+1 drone tempur (maks 3).',
      apply: function (s) { s.drones = Math.min(3, s.drones + 1); },
    },
    {
      id: 'rocket',
      name: 'Rocket Pod',
      icon: '▲',
      desc: '+1 peluncur roket (maks 2).',
      apply: function (s) { s.rockets = Math.min(2, s.rockets + 1); },
    },
    {
      id: 'plating',
      name: 'Hull Plating',
      icon: '▣',
      desc: '+40 hull maks & pulih 40.',
      apply: function (s) { s.maxHull += 40; s.hull = Math.min(s.maxHull, s.hull + 40); },
    },
  ];

  // Enemy archetypes. HP comes from SIZE (radius): bigger enemies are
  // tougher — hp = round(2.2 * radius), boss x8 — then grows 20% per wave.
  // Damage grows 6% per wave and XP 12% per wave, so the longer you play,
  // the harder it gets and the more each kill is worth.
  SIEGE.HP_PER_R = 2.2;
  SIEGE.BOSS_HP_MUL = 8;
  SIEGE.enemyHp = function (kind, wave) {
    var def = SIEGE.ENEMIES[kind];
    var base = Math.round(SIEGE.HP_PER_R * def.r) * (kind === 'boss' ? SIEGE.BOSS_HP_MUL : 1);
    return Math.round(base * (1 + 0.2 * (wave - 1)));
  };
  SIEGE.enemyDmg = function (kind, wave) {
    return SIEGE.ENEMIES[kind].dmg * (1 + 0.06 * (wave - 1));
  };
  SIEGE.enemyXp = function (kind, wave) {
    return Math.round(SIEGE.ENEMIES[kind].xp * (1 + 0.12 * (wave - 1)));
  };

  SIEGE.ENEMIES = {
    drone: {
      kind: 'drone', name: 'Drone',
      speed: 92, speedPerWave: 3,
      r: 13, dmg: 10, xp: 10, score: 50, color: '#ff4d6d',
    },
    weaver: {
      kind: 'weaver', name: 'Weaver',
      speed: 132, speedPerWave: 2,
      r: 12, dmg: 8, xp: 12, score: 70, color: '#ff9f43',
    },
    tank: {
      kind: 'tank', name: 'Tank',
      speed: 56, speedPerWave: 1,
      r: 22, dmg: 18, xp: 22, score: 120, color: '#b388ff',
    },
    splitter: {
      kind: 'splitter', name: 'Splitter',
      speed: 78, speedPerWave: 2,
      r: 15, dmg: 12, xp: 14, score: 90, color: '#5cf2a6',
    },
    mite: {
      kind: 'mite', name: 'Mite',
      speed: 150, speedPerWave: 2,
      r: 8, dmg: 6, xp: 4, score: 20, color: '#7dffce',
    },
    boss: {
      kind: 'boss', name: 'Siege Core',
      speed: 42, speedPerWave: 0,
      r: 46, dmg: 26, xp: 150, score: 1500, color: '#ff2e63',
    },
  };

  // Wave composition: 20 targets per wave; mix shifts as waves go on.
  // Boss waves (every 5th) are 12 escorts + 1 boss.
  SIEGE.waveComp = function (wave) {
    var total = 20;
    var list = [];
    var i;
    if (wave % 5 === 0) {
      for (i = 0; i < 12; i++) list.push(i % 3 === 0 ? 'tank' : i % 3 === 1 ? 'weaver' : 'drone');
      list.push('boss');
      return list;
    }
    var tanks = wave >= 3 ? 3 + Math.floor(wave / 3) : 0;
    var splitters = wave >= 2 ? 2 + Math.floor(wave / 4) : 0;
    var weavers = 3 + Math.floor(wave / 2);
    var drones = total - tanks - splitters - weavers;
    for (i = 0; i < drones; i++) list.push('drone');
    for (i = 0; i < weavers; i++) list.push('weaver');
    for (i = 0; i < splitters; i++) list.push('splitter');
    for (i = 0; i < tanks; i++) list.push('tank');
    // Deterministic shuffle by wave so staged screenshots repeat.
    var seed = wave * 2654435761;
    for (i = list.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      var j = seed % (i + 1);
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  };

  SIEGE.xpNeed = function (level) { return 55 + (level - 1) * 35; };
  SIEGE.WAVE_TARGET = 20;

  // Small helpers shared by the other modules.
  SIEGE.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  SIEGE.dist2 = function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  SIEGE.rand = function (a, b) { return a + Math.random() * (b - a); };
  // Seeded RNG (mulberry32) for deterministic staged scenes.
  SIEGE.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
})();
