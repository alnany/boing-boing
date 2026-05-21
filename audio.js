// Boing Boing — sound effects (Web Audio API synthesis, no asset files).
//
// All sounds are generated on the fly with oscillators and noise buffers, so
// the game stays a single-asset static deploy and works fully offline.
//
// Safari / iOS need the AudioContext to be created or resumed inside a user
// gesture, so we lazy-init on first pointerdown.
(function () {
  let ctx = null;
  let master = null;
  let unlocked = false;
  let noiseBuf = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    // Prebake 2s of white noise we can reuse for splats / gushes.
    const rate = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, rate * 2, rate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }

  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    // Tiny silent blip — some iOS versions only fully wake the graph after
    // the first actual node render.
    if (!unlocked) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const o = ctx.createOscillator();
      o.connect(g).connect(master);
      o.start();
      o.stop(ctx.currentTime + 0.01);
      unlocked = true;
    }
  }

  document.addEventListener('pointerdown', unlock, { passive: true });

  function now() { return ctx.currentTime; }

  // ------------------------------------------------------------------
  // boing() — classic cartoon ball bounce. Descending pitch sine with a
  // very fast vibrato; the quick pitch drop is what makes it "boiiiing".
  // `variant` (0..15) nudges the pitch so repeated taps aren't identical.
  // ------------------------------------------------------------------
  function boing(variant) {
    init();
    if (!ctx) return;
    unlock();
    const t = now();

    // Map variant to a friendly pentatonic root (A minor pent.), so all
    // the balls together sound musical instead of arbitrary.
    const pent = [440, 523.25, 587.33, 659.25, 783.99]; // A4 C5 D5 E5 G5
    const root = pent[(variant | 0) % pent.length] * (1 + ((variant | 0) >> 2) * 0.06);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    // Fast drop from ~2× root → root → 0.55× root gives the classic boing arc.
    osc.frequency.setValueAtTime(root * 2.1, t);
    osc.frequency.exponentialRampToValueAtTime(root, t + 0.07);
    osc.frequency.exponentialRampToValueAtTime(root * 0.55, t + 0.28);

    // Vibrato (LFO) on the oscillator frequency.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = root * 0.07;
    lfo.connect(lfoGain).connect(osc.frequency);

    // Amplitude envelope.
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);

    osc.connect(g).connect(master);
    lfo.start(t);
    osc.start(t);
    lfo.stop(t + 0.34);
    osc.stop(t + 0.34);
  }

  // ------------------------------------------------------------------
  // pop() — short breathy "poof" when a safe ball scales to zero.
  // ------------------------------------------------------------------
  function pop() {
    init();
    if (!ctx) return;
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 1.0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(350, t + 0.16);
    bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.2);
  }

  // ------------------------------------------------------------------
  // warn() — low ominous rising rumble during the 1.1s bomb-warning shake.
  // ------------------------------------------------------------------
  function warn() {
    init();
    if (!ctx) return;
    unlock();
    const t = now();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 1.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.6, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    osc.connect(lp).connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 1.1);
  }

  // ------------------------------------------------------------------
  // bomb() — the pacifier-fountain gush. An initial splat followed by
  // ~1.5s of sputtering liquid noise that matches the visible jet.
  // ------------------------------------------------------------------
  function bomb() {
    init();
    if (!ctx) return;
    unlock();
    const t = now();

    // (1) Initial "splat" — sub thump + noise burst.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(28, t + 0.35);
    const thumpG = ctx.createGain();
    thumpG.gain.setValueAtTime(0.0001, t);
    thumpG.gain.exponentialRampToValueAtTime(1.0, t + 0.02);
    thumpG.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    thump.connect(thumpG).connect(master);
    thump.start(t);
    thump.stop(t + 0.5);

    const burst = ctx.createBufferSource();
    burst.buffer = noiseBuf;
    burst.playbackRate.value = 1.1;
    const burstHp = ctx.createBiquadFilter();
    burstHp.type = 'highpass';
    burstHp.frequency.value = 200;
    const burstG = ctx.createGain();
    burstG.gain.setValueAtTime(0.0001, t);
    burstG.gain.exponentialRampToValueAtTime(0.9, t + 0.015);
    burstG.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    burst.connect(burstHp).connect(burstG).connect(master);
    burst.start(t);
    burst.stop(t + 0.65);

    // (2) Sustained gush — noise through a resonant band-pass that sweeps
    // up and down, giving a "gurgling pacifier fountain" quality. Layered
    // with a slow tremolo so it sputters instead of hissing evenly.
    const gush = ctx.createBufferSource();
    gush.buffer = noiseBuf;
    gush.loop = true;
    gush.playbackRate.value = 0.9;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(900, t + 0.1);
    bp.frequency.linearRampToValueAtTime(1800, t + 0.7);
    bp.frequency.linearRampToValueAtTime(1200, t + 1.3);
    bp.frequency.linearRampToValueAtTime(700, t + 2.0);

    const gushG = ctx.createGain();
    gushG.gain.setValueAtTime(0.0001, t + 0.05);
    gushG.gain.exponentialRampToValueAtTime(0.75, t + 0.2);
    gushG.gain.setValueAtTime(0.75, t + 1.2);
    gushG.gain.exponentialRampToValueAtTime(0.25, t + 2.0);
    gushG.gain.exponentialRampToValueAtTime(0.001, t + 2.4);

    // Tremolo — AM the gush so it sputters.
    const trem = ctx.createOscillator();
    trem.type = 'sine';
    trem.frequency.value = 11;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.5;
    const tremOffset = ctx.createConstantSource();
    tremOffset.offset.value = 0.5;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    trem.connect(tremGain).connect(amp.gain);
    tremOffset.connect(amp.gain);

    gush.connect(bp).connect(amp).connect(gushG).connect(master);
    gush.start(t + 0.05);
    gush.stop(t + 2.5);
    trem.start(t + 0.05);
    trem.stop(t + 2.5);
    tremOffset.start(t + 0.05);
    tremOffset.stop(t + 2.5);
  }

  // ------------------------------------------------------------------
  // win() — bright ascending pentatonic chime.
  // ------------------------------------------------------------------
  function win() {
    init();
    if (!ctx) return;
    unlock();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      const t = now() + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }

  window.SFX = { boing, pop, warn, bomb, win, unlock };
})();
