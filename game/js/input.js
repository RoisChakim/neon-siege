// NEON SIEGE — input.js. Keyboard, mouse and touch controls.
// Pointer positions are mapped into the virtual 1280x720 field (never the
// raw canvas pixels), so high-DPI screens and letterboxing cannot shift them.

(function () {
  'use strict';

  var SIEGE = window.SIEGE;
  var FIELD = SIEGE.FIELD;

  var keys = {};
  var mouse = { x: FIELD.w / 2, y: FIELD.h / 2, down: false };
  var joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
  var fireHeld = false;
  var touchMode = false;

  var canvas = null;
  var scale = 1, offsetX = 0, offsetY = 0;

  function toVirtual(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) / r.width * FIELD.w,
      y: (clientY - r.top) / r.height * FIELD.h,
    };
  }

  function isTouch(e) {
    return e.pointerType === 'touch' || e.type.indexOf('touch') === 0;
  }

  SIEGE.input = {
    keys: keys,
    mouse: mouse,
    joy: joy,

    get firing() { return fireHeld || keys['KeyJ'] || keys['KeyF'] || mouse.down; },
    get touchMode() { return touchMode; },

    // Movement vector from keys or the virtual joystick, normalized.
    moveVector: function () {
      var x = 0, y = 0;
      if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) x += 1;
      if (keys['KeyW'] || keys['ArrowUp']) y -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) y += 1;
      if (joy.active) { x += joy.dx; y += joy.dy; }
      var len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      return { x: x, y: y };
    },

    attach: function (c, handlers) {
      canvas = c;

      window.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        keys[e.code] = true;
        if (handlers.onKey) handlers.onKey(e.code, true);
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) !== -1) {
          e.preventDefault();
        }
      });
      window.addEventListener('keyup', function (e) {
        keys[e.code] = false;
        if (handlers.onKey) handlers.onKey(e.code, false);
      });
      window.addEventListener('blur', function () {
        for (var k in keys) keys[k] = false;
        fireHeld = false;
        mouse.down = false;
        joy.active = false;
      });

      c.addEventListener('pointerdown', function (e) {
        SIEGE.audio.unlock();
        if (isTouch(e)) touchMode = true;
        var p = toVirtual(e.clientX, e.clientY);
        if (handlers.onPointerDown) handlers.onPointerDown(p.x, p.y, e);
        // Left half of the field is the joystick zone on touch devices.
        if (touchMode && p.x < FIELD.w * 0.42 && !joy.active) {
          joy.active = true;
          joy.id = e.pointerId;
          joy.ox = p.x; joy.oy = p.y;
          joy.dx = 0; joy.dy = 0;
          c.setPointerCapture(e.pointerId);
        } else if (!touchMode) {
          mouse.down = true;
          mouse.x = p.x; mouse.y = p.y;
        }
        e.preventDefault();
      });
      c.addEventListener('pointermove', function (e) {
        var p = toVirtual(e.clientX, e.clientY);
        mouse.x = p.x; mouse.y = p.y;
        if (joy.active && e.pointerId === joy.id) {
          var dx = (p.x - joy.ox) / 56;
          var dy = (p.y - joy.oy) / 56;
          var len = Math.hypot(dx, dy);
          if (len > 1) { dx /= len; dy /= len; }
          joy.dx = dx; joy.dy = dy;
        }
      });
      function endPointer(e) {
        if (joy.active && e.pointerId === joy.id) {
          joy.active = false; joy.dx = 0; joy.dy = 0;
        }
        if (!touchMode) mouse.down = false;
      }
      c.addEventListener('pointerup', endPointer);
      c.addEventListener('pointercancel', endPointer);
      c.addEventListener('contextmenu', function (e) { e.preventDefault(); });

      // On-screen touch buttons (TEMBAK hold, GANTI tap, DASH tap, ULTI tap).
      var fireBtn = document.getElementById('btn-fire');
      var swapBtn = document.getElementById('btn-swap');
      var dashBtn = document.getElementById('btn-dash');
      var ultiBtn = document.getElementById('btn-ulti');
      if (fireBtn) {
        fireBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); SIEGE.audio.unlock(); fireHeld = true; });
        fireBtn.addEventListener('pointerup', function () { fireHeld = false; });
        fireBtn.addEventListener('pointercancel', function () { fireHeld = false; });
        fireBtn.addEventListener('pointerleave', function () { fireHeld = false; });
      }
      if (swapBtn) {
        swapBtn.addEventListener('pointerdown', function (e) {
          e.preventDefault(); SIEGE.audio.unlock();
          if (handlers.onSwap) handlers.onSwap();
        });
      }
      if (dashBtn) {
        dashBtn.addEventListener('pointerdown', function (e) {
          e.preventDefault(); SIEGE.audio.unlock();
          if (handlers.onDash) handlers.onDash();
        });
      }
      if (ultiBtn) {
        ultiBtn.addEventListener('pointerdown', function (e) {
          e.preventDefault(); SIEGE.audio.unlock();
          if (handlers.onUlti) handlers.onUlti();
        });
      }
    },

    // Called every frame so the game can lay out the joystick base.
    setScale: function (s, ox, oy) { scale = s; offsetX = ox; offsetY = oy; },
  };
})();
