(() => {
  const TOTAL = 16;
  const grid = document.getElementById('grid');
  const stage = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  const againBtn = document.getElementById('again');
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');

  let bombIndex = -1;
  let cleared = 0;
  let over = false;

  // Tracks the canvas's CSS dimensions (the area particles can fly
  // over). On iOS Safari the canvas is sized via 100lvw/100lvh so it
  // can stretch under the persistent bottom toolbar — meanwhile
  // window.innerHeight stops at the toolbar's top edge. Particle
  // spawn positions and the bottom-cull check have to use the canvas
  // dimensions or the eruption "ends" at innerHeight+60 and the last
  // 50–100px of milk never lands.
  let viewW = innerWidth;
  let viewH = innerHeight;

  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const vvW = (window.visualViewport && window.visualViewport.width)  || 0;
    const vvH = (window.visualViewport && window.visualViewport.height) || 0;
    const sw  = (screen && screen.width)  || 0;
    const sh  = (screen && screen.height) || 0;
    // Logical paint area used by particle physics (spawn / cull / sheet
    // radius). Take the LARGEST plausible viewport size across every
    // signal: visualViewport, innerWidth/Height, documentElement, and
    // screen.width/height — the last is the device display in CSS px
    // and is the only one that always includes the area behind iOS
    // Safari's bottom toolbar AND the PWA home-indicator strip.
    const w = Math.max(vvW, innerWidth,  document.documentElement.clientWidth,  sw);
    const h = Math.max(vvH, innerHeight, document.documentElement.clientHeight, sh);
    viewW = w;
    viewH = h;
    // Pixel buffer is 200px taller than viewH so the canvas extends
    // far past the bottom edge of every plausible viewport
    // measurement. iOS PWA can anchor position:fixed to the safe-area
    // inset (i.e. start ~50px below the literal screen top), which
    // would leave a strip at the bottom uncovered when the canvas's
    // height equals exactly the visible viewport. The extra 200px
    // absorbs that offset and any visual-viewport drift between
    // frames; the strip extends behind the home indicator and is not
    // visible. Particle physics still uses viewW/viewH (the correct
    // logical area), so drawings beyond viewH simply land in buffer.
    const padW = w;
    const padH = h + 200;
    canvas.style.width  = padW + 'px';
    canvas.style.height = padH + 'px';
    canvas.width  = Math.round(padW * dpr);
    canvas.height = Math.round(padH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeCanvas();
  addEventListener('resize', sizeCanvas);
  addEventListener('orientationchange', sizeCanvas);
  // visualViewport fires its own resize when iOS Safari's URL bar
  // collapses/expands — the window 'resize' event lags behind on some
  // builds, so we listen to both and keep the canvas pixel buffer in
  // lockstep with the actually-visible area. Without this, milk
  // particles drawn near the top/bottom got clipped after a URL-bar
  // transition because the canvas was still sized to the old viewport.
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', sizeCanvas);
    window.visualViewport.addEventListener('scroll', sizeCanvas);
  }

  // ---- Particle system ----
  const particles = [];
  const sheets = []; // fullscreen milk coating

  // Directional cone burst — milk shoots like a pacifier/fountain in a
  // focused cone around `baseAngle` (radians; -PI/2 = straight up in screen
  // coords). `spread` is the half-angle of the cone.
  function emitBurst(x, y, count, speedBase, speedVar, baseAngle = -Math.PI / 2, spread = Math.PI / 5) {
    for (let i = 0; i < count; i++) {
      // Gaussian-ish bias toward the center of the cone (averaging 2 randoms)
      const t = (Math.random() + Math.random()) / 2 - 0.5;
      const angle = baseAngle + t * spread * 2;
      const speed = speedBase + Math.random() * speedVar;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 10,
        life: 1,
        decay: 0.003 + Math.random() * 0.006,
        gravity: 0.35 + Math.random() * 0.2, // stronger gravity for arc
        type: 'milk',
      });
    }
  }

  // Chunky slower globs — also cone-shaped, slightly wider spread
  function emitBlobs(x, y, count, speedBase, speedVar, baseAngle = -Math.PI / 2, spread = Math.PI / 3.5) {
    for (let i = 0; i < count; i++) {
      const t = (Math.random() + Math.random()) / 2 - 0.5;
      const angle = baseAngle + t * spread * 2;
      const speed = speedBase + Math.random() * speedVar;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 14 + Math.random() * 30,
        life: 1,
        decay: 0.004 + Math.random() * 0.006,
        gravity: 0.45,
        type: 'blob',
      });
    }
  }

  // Expanding ring shockwave
  function emitRing(x, y, speed = 40, life = 1) {
    particles.push({ x, y, vx: 0, vy: 0, r: 8, life, decay: 0.02, speed, type: 'ring' });
  }

  // Fullscreen milk sheet — grows from center and coats the whole screen.
  function emitSheet(x, y, maxR, delay = 0) {
    setTimeout(() => {
      sheets.push({ x, y, r: 0, maxR, life: 1, growth: maxR / 22, decay: 0.004 });
    }, delay);
  }

  // Drips from above — rain down across the full width so it looks like the
  // entire screen is dripping with milk afterwards.
  function emitDrips(count = 120) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * viewW,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 2,
        vy: 3 + Math.random() * 10,
        r: 4 + Math.random() * 10,
        life: 1,
        decay: 0.0025 + Math.random() * 0.004,
        gravity: 0.25,
        type: 'milk',
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fullscreen milk sheets (drawn first so particles sit on top)
    for (let i = sheets.length - 1; i >= 0; i--) {
      const s = sheets[i];
      s.r += s.growth;
      if (s.r >= s.maxR) s.life -= s.decay;
      if (s.life <= 0) { sheets.splice(i, 1); continue; }

      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      // Push the opaque core out to ~85% of radius so the visible
      // viewport (which sits well within the 0..maxDim region) gets
      // saturated milk all the way to its corners. The outer 15% of
      // the gradient — where milk fades to transparent — extends past
      // the screen edges into the canvas's overshoot buffer, so the
      // user never sees the falloff seam.
      g.addColorStop(0, `rgba(255, 253, 246, ${0.9 * s.life})`);
      g.addColorStop(0.6, `rgba(255, 253, 246, ${0.88 * s.life})`);
      g.addColorStop(0.85, `rgba(255, 253, 246, ${0.78 * s.life})`);
      g.addColorStop(1, `rgba(255, 253, 246, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      if (p.type === 'ring') {
        p.r += p.speed;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life) * 0.75;
        ctx.strokeStyle = '#fffdf6';
        ctx.lineWidth = 14 * p.life + 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }

      p.vy += p.gravity || 0.3;
      p.vx *= 0.997;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > viewH + 60) { particles.splice(i, 1); continue; }

      const alpha = Math.max(0, Math.min(1, p.life));
      ctx.globalAlpha = alpha;
      if (p.type === 'milk') {
        ctx.fillStyle = '#fffdf6';
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 6) {
          const ang = Math.atan2(p.vy, p.vx);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r * Math.min(3.5, speed / 4), p.r * 0.65, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---- Game logic ----
  function build() {
    grid.innerHTML = '';
    cleared = 0;
    over = false;
    bombIndex = Math.floor(Math.random() * TOTAL);
    overlay.hidden = true;
    stage.classList.remove('shake');
    document.body.classList.remove('erupting');

    for (let i = 0; i < TOTAL; i++) {
      const b = document.createElement('div');
      b.className = 'ball';
      b.style.setProperty('--d', (Math.random() * -4).toFixed(2) + 's');
      b.dataset.idx = i;
      // pointerdown (not click) — fires once per finger, in parallel,
      // so multiple simultaneous taps each register and animate.
      b.addEventListener('pointerdown', onBallClick);
      grid.appendChild(b);
    }
  }

  function onBallClick(e) {
    if (over) return;
    const el = e.currentTarget;
    if (el.dataset.gone) return;
    el.dataset.gone = '1';
    const idx = Number(el.dataset.idx);

    if (idx === bombIndex) {
      over = true;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Audio: low rising rumble through the warning shake.
      if (window.SFX) window.SFX.warn();

      // Clear inline transform left by the device-motion physics tick before
      // handing the element to the CSS animation engine.
      el.style.transform = '';

      // Single combined warn (1.1s) + boom (0.9s) animation. Driving both
      // phases from one class eliminates the swap that previously dropped
      // the visual under load. JS only schedules the eruption sound &
      // particles; the visible deformation is fully owned by CSS.
      el.classList.add('detonate');

      setTimeout(() => {
        stage.classList.add('shake');
        // Flip the page itself to milk so any strip that escapes the
        // canvas (iOS PWA standalone has anchored position:fixed inside
        // the safe-area inset on some builds, leaving the home-indicator
        // strip uncovered by the canvas no matter how tall we make it)
        // visually reads as milk, not the pink resting bg. The body's
        // ::before paints the entire viewport including any iOS-managed
        // strip outside the layout viewport, which is exactly the area
        // we couldn't reach via canvas. Reverted on play-again reset.
        document.body.classList.add('erupting');

        // Audio: splat + sustained gush, matched to the visual fountain.
        if (window.SFX) window.SFX.bomb();

        // Distance from ball center to the farthest screen corner — particles
        // must travel at least this far to cover every pixel.
        const maxDim = Math.hypot(
          Math.max(cx, viewW - cx),
          Math.max(cy, viewH - cy),
        );

        // Fountain geometry — jet aimed up with gentle cone spread.
        // Stronger speed so milk arcs high above the ball like a pacifier geyser.
        const v = maxDim / 18;                 // pixels per frame (at ~60fps)
        const UP = -Math.PI / 2;
        const coneTight = Math.PI / 8;          // narrow core jet
        const coneWide = Math.PI / 4;           // wider outer spray

        // Sustained jet: many overlapping bursts over ~1s, continuously
        // spraying upward out of the ball's center like a pacifier fountain.
        const jetSteps = [
          { t: 0,    core: 140, side: 60 },
          { t: 80,   core: 130, side: 55 },
          { t: 160,  core: 130, side: 55 },
          { t: 260,  core: 125, side: 55 },
          { t: 360,  core: 120, side: 50 },
          { t: 460,  core: 110, side: 45 },
          { t: 580,  core: 100, side: 40 },
          { t: 700,  core:  90, side: 35 },
          { t: 820,  core:  80, side: 30 },
        ];

        jetSteps.forEach(step => {
          setTimeout(() => {
            // Tight fast core — looks like the jet right out of the nipple
            emitBurst(cx, cy, step.core, v * 0.9, v * 0.45, UP, coneTight);
            // Wider falling splatter around the jet
            emitBurst(cx, cy, step.side, v * 0.5, v * 0.5, UP, coneWide);
          }, step.t);
        });

        // Chunky globs dribbling out alongside the jet
        emitBlobs(cx, cy, 40, v * 0.35, v * 0.35, UP, coneWide);
        setTimeout(() => emitBlobs(cx, cy, 40, v * 0.3, v * 0.3, UP, coneWide), 300);
        setTimeout(() => emitBlobs(cx, cy, 40, v * 0.25, v * 0.3, UP, coneWide), 600);

        // Shockwave rings from the point of emission
        emitRing(cx, cy, maxDim / 18, 1);
        setTimeout(() => emitRing(cx, cy, maxDim / 22, 0.9), 220);

        // --- Phase 2 (~900ms): ball pops — final mega jet + coat ---
        setTimeout(() => {
          emitRing(cx, cy, maxDim / 14, 1);
          // One last huge upward blast at the moment of pop
          emitBurst(cx, cy, 420, v * 1.0, v * 0.6, UP, coneTight);
          emitBurst(cx, cy, 200, v * 0.55, v * 0.6, UP, coneWide);
          emitBlobs(cx, cy, 80, v * 0.4, v * 0.4, UP, coneWide);
          // A small omnidirectional splatter at pop for contrast
          emitBurst(cx, cy, 120, v * 0.35, v * 0.45, 0, Math.PI);
          emitSheet(cx, cy, maxDim * 1.8);
        }, 900);

        // --- Phase 3: screen-wide milk coating + drip rain ---
        setTimeout(() => emitSheet(cx, cy, maxDim * 1.9), 1200);
        setTimeout(() => emitDrips(160), 1300);
        setTimeout(() => emitDrips(140), 1700);
        setTimeout(() => emitDrips(100), 2200);
        setTimeout(() => emitDrips(80), 2800);

        [...grid.querySelectorAll('.ball')].forEach((b, i) => {
          if (i === idx) return;
          setTimeout(() => b.classList.add('jiggle'), 250 + Math.random() * 400);
        });

        setTimeout(() => { overlay.hidden = false; }, 4400);
      }, 1100);
    } else {
      el.classList.add('jiggle');
      // Audio: musical boing per ball (index → pentatonic pitch), then pop.
      if (window.SFX) {
        window.SFX.boing(idx);
        setTimeout(() => window.SFX.pop(), 780);
      }
      cleared++;
      setTimeout(() => { el.style.visibility = 'hidden'; }, 900);
      if (cleared === TOTAL - 1) {
        setTimeout(() => { if (window.SFX) window.SFX.win(); over = true; overlay.hidden = false; }, 500);
      }
    }
  }

  againBtn.addEventListener('click', build);

  // --- Jello physics: balls sway when the PHONE MOVES (device motion) ---
  // A shared spring-damper takes impulses from the accelerometer and the
  // whole grid wobbles back toward rest — like a plate of jello on a
  // shaking table. Each ball also gets a small per-index phase so the
  // wobble isn't perfectly uniform.
  let jx = 0, jy = 0, jvx = 0, jvy = 0;
  let prevAx = null, prevAy = null;
  let motionBound = false;

  function onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    const ax = a.x || 0;
    const ay = a.y || 0;
    if (prevAx === null) { prevAx = ax; prevAy = ay; return; }
    const dx = ax - prevAx;
    const dy = ay - prevAy;
    prevAx = ax;
    prevAy = ay;
    // Translate device jerk into screen-space impulse.
    // Device +x points right → inertia pushes balls left, so invert.
    // Device +y points up (top of phone) → screen +y is down, so keep sign.
    const scale = 2.4;
    jvx += -dx * scale;
    jvy +=  dy * scale;
  }

  function bindMotion() {
    if (motionBound) return;
    window.addEventListener('devicemotion', onMotion, { passive: true });
    motionBound = true;
  }

  async function enableMotion() {
    if (motionBound) return true;
    try {
      const DME = window.DeviceMotionEvent;
      if (DME && typeof DME.requestPermission === 'function') {
        // iOS 13+ requires a user gesture before prompting.
        const perm = await DME.requestPermission();
        if (perm === 'granted') { bindMotion(); return true; }
        return false;
      }
      bindMotion();
      return true;
    } catch (_) {
      // Non-iOS browsers that support DeviceMotion without the prompt
      try { bindMotion(); return true; } catch(_) { return false; }
    }
  }

  // Try right away (Android / desktop). On iOS this will no-op until the
  // first user gesture triggers the permission prompt below.
  enableMotion();
  document.addEventListener('pointerdown', () => { enableMotion(); }, { passive: true });

  function physicsTick() {
    const spring = 0.11;
    const damping = 0.82;
    jvx += -jx * spring;
    jvy += -jy * spring;
    jvx *= damping;
    jvy *= damping;
    jx += jvx;
    jy += jvy;
    const MAX = 18;
    if (jx > MAX) jx = MAX; else if (jx < -MAX) jx = -MAX;
    if (jy > MAX) jy = MAX; else if (jy < -MAX) jy = -MAX;

    const balls = grid.children;
    const t = performance.now() * 0.001;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b.classList || !b.classList.contains('ball')) continue;
      const cl = b.classList;
      // Let class-based animations (click jiggle / bomb detonate) own the
      // transform while they run. Physics resumes when they finish.
      if (cl.contains('jiggle') || cl.contains('detonate')) {
        b.style.transform = '';
        continue;
      }
      const phase = i * 0.42;
      const amp = 0.82 + Math.sin(t * 3.2 + phase) * 0.22;
      const tx = jx * amp;
      const ty = jy * amp;
      const rz = jx * 0.32 + Math.sin(t * 2.1 + phase) * 0.25;
      b.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotate(${rz.toFixed(2)}deg)`;
    }

    // The play-again ball wobbles on the same jello physics. It's bigger
    // so displacement reads larger — scale the amplitude down a touch.
    if (againBtn && !overlay.hidden) {
      const ampA = 1.05 + Math.sin(t * 2.6) * 0.18;
      const tx = jx * ampA * 0.65;
      const ty = jy * ampA * 0.65;
      const rz = jx * 0.22 + Math.sin(t * 1.7) * 0.35;
      againBtn.style.setProperty('--wx', `${tx.toFixed(2)}px`);
      againBtn.style.setProperty('--wy', `${ty.toFixed(2)}px`);
      againBtn.style.setProperty('--rz', `${rz.toFixed(2)}deg`);
    }
    requestAnimationFrame(physicsTick);
  }
  requestAnimationFrame(physicsTick);

  build();
})();
