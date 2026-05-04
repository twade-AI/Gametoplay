/* ============================================================
 * The Haileybury Dining Hall
 * ----------------------------------------------------------
 * 11 hand-drawn dishes that merge upward, set in the school
 * dining hall in Hertford. Sursum Corda — lift up your plates!
 * ============================================================ */

(() => {
  const { Engine, World, Bodies, Body, Events } = Matter;

  // ----- Canvas setup -------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 900
  const H = canvas.height;  // 1000

  // ============================================================
  // FIT-TO-VIEWPORT — the canvas always shows the entire bowl,
  // landscape or portrait, on any device.
  // ============================================================
  function fitCanvas() {
    const wrap = document.querySelector('.game-wrap');
    const board = document.querySelector('.board');
    if (!wrap || !board) return;
    // Read the area available to the board (after the title banner).
    const cs = getComputedStyle(board);
    const gap = parseFloat(cs.gap) || 8;
    // Find the column / row layout from the actual computed grid.
    const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    const portrait = cols <= 1;
    const boardRect = board.getBoundingClientRect();
    let availW, availH;
    if (portrait) {
      // canvas on top, HUD strip below
      const hud = board.querySelector('.hud');
      const hudH = hud ? hud.getBoundingClientRect().height : 0;
      availW = boardRect.width;
      availH = Math.max(80, boardRect.height - hudH - gap);
    } else {
      // canvas on the left, HUD column on the right
      const hud = board.querySelector('.hud');
      const hudW = hud ? hud.getBoundingClientRect().width : 0;
      availW = Math.max(80, boardRect.width - hudW - gap);
      availH = boardRect.height;
    }
    // 9:10 aspect — pick the largest box that fits in (availW, availH)
    const heightFromW = availW * (10 / 9);
    let w, h;
    if (heightFromW <= availH) { w = availW; h = heightFromW; }
    else { h = availH; w = availH * (9 / 10); }
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
  }
  // Run once now and again whenever layout changes.
  let _fitTimer = 0;
  function scheduleFit() {
    cancelAnimationFrame(_fitTimer);
    _fitTimer = requestAnimationFrame(fitCanvas);
  }
  // Call immediately, again after fonts load (banner reflow), and on every
  // resize / orientation change.
  scheduleFit();
  window.addEventListener('load', scheduleFit);
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('orientationchange', () => setTimeout(scheduleFit, 120));
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleFit).catch(() => {});
  }
  // The HUD's content height also changes when score/best update — observe it
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(scheduleFit);
    ro.observe(document.body);
  }

  // Play-field geometry (the bowl). Halved in size from the original layout
  // so the bowl fills up much faster — only one Trifle fits, larger tiers
  // must be stacked vertically rather than side-by-side.
  const PLAY_LEFT   = 275;
  const PLAY_RIGHT  = 625;
  const PLAY_TOP    = 240;
  const PLAY_BOTTOM = 720;
  const DANGER_Y    = 298;
  const LADLE_Y     = 200;

  // ----- Tiny seedable RNG (so hand-drawn art is stable) --------------------
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ----- Hand-drawn helpers -------------------------------------------------
  // Comic-book ink: thick, near-black outlines on every dish so they read
  // instantly against the background.
  function inkOutline(ctx, w = 4) {
    ctx.strokeStyle = '#120802';
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  function wobblyCircle(ctx, x, y, r, seed, fill = true, stroke = true) {
    // Smoother than a true wobble — small low-frequency variation gives a
    // hand-drawn feel without a noisy outline that reads as "spiky".
    const rng = mulberry(seed);
    ctx.beginPath();
    const steps = 48 + Math.floor(r / 3);
    const phase1 = rng() * Math.PI * 2;
    const phase2 = rng() * Math.PI * 2;
    const amp1 = Math.max(0.6, r * 0.018);
    const amp2 = Math.max(0.4, r * 0.012);
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const j = Math.sin(a * 3 + phase1) * amp1 + Math.sin(a * 5 + phase2) * amp2;
      const px = x + Math.cos(a) * (r + j);
      const py = y + Math.sin(a) * (r + j);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Rounded-pebble shape for "rectangular" foods so that a circle physics
  // body matches what the eye sees on contact.
  function roundedRect(ctx, w, h, cr) {
    ctx.beginPath();
    ctx.moveTo(-w + cr, -h);
    ctx.lineTo(w - cr, -h);
    ctx.quadraticCurveTo(w, -h, w, -h + cr);
    ctx.lineTo(w, h - cr);
    ctx.quadraticCurveTo(w, h, w - cr, h);
    ctx.lineTo(-w + cr, h);
    ctx.quadraticCurveTo(-w, h, -w, h - cr);
    ctx.lineTo(-w, -h + cr);
    ctx.quadraticCurveTo(-w, -h, -w + cr, -h);
    ctx.closePath();
  }

  function speckle(ctx, x, y, r, seed, count, color) {
    const rng = mulberry(seed);
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * r * 0.85;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.4 + rng() * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Note: previously each food sprite had a faint shadow blob, but it caused
  // visible gaps between stacked foods. Removed so foods sit flush.


  // ============================================================
  // FOODS — 11 tiers, smallest to largest
  // (radii hand-tuned so each tier is visibly bigger than the last)
  // ============================================================
  const FOODS = [
    { // 0
      name: 'Garden Pea',
      radius: 16, color: "#5fd400",
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx, 3);
        wobblyCircle(ctx, 0, 0, r, seed);
        ctx.fillStyle = '#d6ff7a';
        ctx.beginPath();
        ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.4, r * 0.18, -0.5, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    { // 1
      name: 'Baked Bean',
      radius: 26, color: "#ff5a14",
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        ctx.beginPath();
        ctx.moveTo(-r * 0.95, 0);
        ctx.bezierCurveTo(-r * 0.95, -r * 1.1, r * 0.95, -r * 1.1, r * 0.95, 0);
        ctx.bezierCurveTo(r * 0.95, r * 0.95, r * 0.4, r * 0.45, 0, r * 0.55);
        ctx.bezierCurveTo(-r * 0.4, r * 0.45, -r * 0.95, r * 0.95, -r * 0.95, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffc888';
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.45, r * 0.4, r * 0.13, -0.3, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    { // 2
      name: 'Crusty Crouton',
      radius: 38, color: "#f5c455",
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        // soft pillow / pebble — generous corner radius keeps it round on contact
        const w = r * 0.92, h = r * 0.82, cr = r * 0.4;
        roundedRect(ctx, w, h, cr);
        ctx.fill(); ctx.stroke();
        // soft top-left highlight
        ctx.fillStyle = '#f6dfa3';
        ctx.beginPath();
        ctx.ellipse(-w * 0.25, -h * 0.3, w * 0.55, h * 0.2, -0.2, 0, Math.PI * 2);
        ctx.fill();
        // crumb texture
        speckle(ctx, 0, 0, r * 0.78, seed + 7, 22, '#8a5a1c');
        const rng = mulberry(seed + 3);
        ctx.fillStyle = '#f3d491';
        for (let i = 0; i < 5; i++) {
          const a = rng() * Math.PI * 2; const d = rng() * r * 0.5;
          ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      },
    },
    { // 3
      name: 'Battered Fish',
      radius: 52, color: "#ffc14a",
      draw(ctx, r, seed) {
        // Whole battered cod fillet: chunky teardrop body with a forked tail.
        // The fattest point sits inside the physics circle so contact reads
        // correctly even though the silhouette is non-circular.
        const rng = mulberry(seed);
        ctx.fillStyle = this.color; inkOutline(ctx);

        // body — wide head end (left) tapering to the tail join (right)
        ctx.beginPath();
        ctx.moveTo(-r * 0.92, -r * 0.05);                          // nose top
        ctx.bezierCurveTo(-r * 0.85, -r * 0.7, r * 0.45, -r * 0.62, r * 0.55, -r * 0.32);
        ctx.lineTo(r * 0.62, -r * 0.18);                           // tail root upper
        ctx.lineTo(r * 0.62, r * 0.18);                            // tail root lower
        ctx.bezierCurveTo(r * 0.45, r * 0.62, -r * 0.85, r * 0.7, -r * 0.92, r * 0.05);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // tail — forked triangle out the right side
        ctx.fillStyle = '#e89a1a';
        ctx.beginPath();
        ctx.moveTo(r * 0.6, -r * 0.22);
        ctx.lineTo(r * 0.98, -r * 0.5);
        ctx.lineTo(r * 0.86, -r * 0.05);
        ctx.lineTo(r * 0.98, r * 0.5);
        ctx.lineTo(r * 0.6, r * 0.22);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // crispy batter craters/ripples — knobbly outer edge details
        ctx.fillStyle = '#d97e10';
        for (let i = 0; i < 18; i++) {
          const a = rng() * Math.PI * 2;
          const d = (0.45 + rng() * 0.4) * r;
          const x = Math.cos(a) * d * 0.95;
          const y = Math.sin(a) * d * 0.6;
          ctx.beginPath();
          ctx.arc(x, y, 1.6 + rng() * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // golden highlight along the top — wet, glossy batter
        ctx.fillStyle = '#fff0a8';
        ctx.beginPath();
        ctx.ellipse(-r * 0.15, -r * 0.42, r * 0.55, r * 0.1, -0.15, 0, Math.PI * 2);
        ctx.fill();

        // little eye dot near the head
        ctx.fillStyle = '#1a0d04';
        ctx.beginPath();
        ctx.arc(-r * 0.62, -r * 0.18, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-r * 0.6, -r * 0.2, 0.9, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    { // 4
      name: 'Cocktail Sausage',
      radius: 66, color: "#ff6a4a",
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        // chubby pill — fits inside the physics circle
        const w = r * 0.92, h = r * 0.68;
        roundedRect(ctx, w, h, h);
        ctx.fill(); ctx.stroke();
        // wrinkle creases
        ctx.lineWidth = 1.6; ctx.strokeStyle = '#5a2a1b';
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * r * 0.3, -h * 0.62);
          ctx.quadraticCurveTo(i * r * 0.3 + 2.5, 0, i * r * 0.3, h * 0.62);
          ctx.stroke();
        }
        // glossy highlight
        ctx.fillStyle = 'rgba(255,220,200,.55)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.3, -h * 0.7, r * 0.55, h * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    { // 5
      name: 'Yorkshire Pudding',
      radius: 80, color: "#ffb338",
      draw(ctx, r, seed) {
        // outer rim
        ctx.fillStyle = '#c97a1a'; inkOutline(ctx);
        wobblyCircle(ctx, 0, r * 0.05, r * 0.96, seed);
        // inner crater
        ctx.fillStyle = this.color;
        wobblyCircle(ctx, 0, -r * 0.03, r * 0.7, seed + 9);
        // gravy pool
        ctx.fillStyle = '#3d1e08';
        wobblyCircle(ctx, 0, 0, r * 0.42, seed + 21, true, false);
        // gravy gloss
        ctx.fillStyle = '#a06022';
        ctx.beginPath();
        ctx.ellipse(-r * 0.12, -r * 0.06, r * 0.2, r * 0.07, -0.3, 0, Math.PI * 2);
        ctx.fill();
        // a single pea, peeking
        ctx.fillStyle = '#7fb83a'; inkOutline(ctx, 1.6);
        ctx.beginPath(); ctx.arc(r * 0.18, r * 0.04, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      },
    },
    { // 6
      name: 'Jacket Potato',
      radius: 92, color: "#cf7d24",
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        const rng = mulberry(seed);
        ctx.beginPath();
        const steps = 26;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const rr = r * (0.92 + (rng() - 0.5) * 0.13);
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr * 0.94;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // slit
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(-r * 0.45, 0);
        ctx.quadraticCurveTo(0, -r * 0.07, r * 0.45, 0);
        ctx.stroke();
        // butter pat
        ctx.fillStyle = '#fff2a8'; inkOutline(ctx, 2);
        ctx.beginPath();
        ctx.rect(-r * 0.18, -r * 0.18, r * 0.36, r * 0.16);
        ctx.fill(); ctx.stroke();
        // skin spots
        speckle(ctx, 0, 0, r * 0.82, seed + 4, 14, '#3e2510');
      },
    },
    { // 7
      name: 'Sunday Roast Chicken',
      radius: 102, color: "#f0a02c",
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        ctx.beginPath();
        ctx.ellipse(0, r * 0.06, r * 0.96, r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // legs
        const drawLeg = (dx) => {
          ctx.fillStyle = '#e8b779'; inkOutline(ctx);
          ctx.beginPath();
          ctx.ellipse(dx, r * 0.55, r * 0.24, r * 0.13, 0.32 * Math.sign(dx), 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fbf4d9';
          ctx.beginPath();
          ctx.ellipse(dx * 1.45, r * 0.5, r * 0.075, r * 0.05, 0, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        };
        drawLeg(-r * 0.45); drawLeg(r * 0.45);
        // glossy highlight
        ctx.fillStyle = 'rgba(255,240,200,.55)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.3, -r * 0.32, r * 0.45, r * 0.14, -0.35, 0, Math.PI * 2);
        ctx.fill();
        // herbs (rosemary)
        ctx.fillStyle = '#3f7a2c';
        const rng = mulberry(seed);
        for (let i = 0; i < 10; i++) {
          const px = -r * 0.42 + rng() * r * 0.84;
          const py = -r * 0.45 + rng() * r * 0.32;
          ctx.beginPath();
          ctx.ellipse(px, py, 3.2, 1.6, rng() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        // tied string
        ctx.strokeStyle = '#fff7df'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.35, r * 0.4); ctx.lineTo(r * 0.35, r * 0.4);
        ctx.stroke();
      },
    },
    { // 8
      name: 'Sticky Toffee Pudding',
      radius: 110, color: "#5a2f15",
      draw(ctx, r, seed) {
        // base
        ctx.fillStyle = this.color; inkOutline(ctx);
        wobblyCircle(ctx, 0, r * 0.12, r * 0.84, seed);
        // top dome
        ctx.fillStyle = '#a05a26';
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.08, r * 0.78, r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // toffee drizzle
        ctx.fillStyle = '#ffa537';
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.05);
        ctx.bezierCurveTo(-r * 0.5, -r * 0.3, -r * 0.2, r * 0.1, r * 0.05, -r * 0.2);
        ctx.bezierCurveTo(r * 0.3, -r * 0.4, r * 0.55, 0, r * 0.7, -r * 0.1);
        ctx.lineTo(r * 0.65, r * 0.15);
        ctx.bezierCurveTo(r * 0.4, r * 0.25, -r * 0.4, r * 0.25, -r * 0.7, r * 0.1);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // shine
        ctx.fillStyle = 'rgba(255,210,140,.5)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.25, -r * 0.32, r * 0.38, r * 0.08, -0.3, 0, Math.PI * 2);
        ctx.fill();
        // whipped cream blob
        ctx.fillStyle = '#fff7e0'; inkOutline(ctx);
        wobblyCircle(ctx, 0, -r * 0.5, r * 0.22, seed + 9);
        // cherry
        ctx.fillStyle = '#c1233b';
        ctx.beginPath(); ctx.arc(0, -r * 0.62, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      },
    },
    { // 9
      name: 'Flaming Christmas Pudding',
      radius: 116, color: "#3a1e0c",
      draw(ctx, r, seed) {
        // FLAMES first (behind), drawn ABOVE the pudding visually
        const grad = ctx.createRadialGradient(0, -r * 1.0, 0, 0, -r * 0.7, r * 1.0);
        grad.addColorStop(0, 'rgba(255,230,80,.95)');
        grad.addColorStop(0.5, 'rgba(255,140,40,.7)');
        grad.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-r * 0.45, -r * 0.55);
        ctx.bezierCurveTo(-r * 0.55, -r * 1.0, r * 0.25, -r * 1.25, 0, -r * 1.55);
        ctx.bezierCurveTo(-r * 0.05, -r * 1.15, r * 0.55, -r * 1.0, r * 0.5, -r * 0.55);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,250,180,.85)';
        ctx.beginPath();
        ctx.moveTo(-r * 0.18, -r * 0.6);
        ctx.bezierCurveTo(-r * 0.24, -r * 0.95, r * 0.1, -r * 1.05, 0.02, -r * 1.3);
        ctx.bezierCurveTo(0.02, -r * 1.0, r * 0.2, -r * 0.95, r * 0.2, -r * 0.6);
        ctx.closePath(); ctx.fill();

        // pudding body
        ctx.fillStyle = this.color; inkOutline(ctx);
        wobblyCircle(ctx, 0, r * 0.06, r * 0.86, seed);
        speckle(ctx, 0, r * 0.06, r * 0.7, seed + 11, 36, '#1a0e07');

        // brandy butter drizzle
        ctx.fillStyle = '#fffadc'; inkOutline(ctx);
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.18);
        ctx.bezierCurveTo(-r * 0.45, -r * 0.55, r * 0.45, -r * 0.55, r * 0.6, -r * 0.18);
        ctx.bezierCurveTo(r * 0.45, 0, r * 0.25, r * 0.05, r * 0.12, 0);
        ctx.bezierCurveTo(0, r * 0.18, -r * 0.22, r * 0.05, -r * 0.32, 0);
        ctx.bezierCurveTo(-r * 0.5, r * 0.12, -r * 0.6, 0, -r * 0.6, -r * 0.18);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // holly leaves
        ctx.fillStyle = '#2f7a2c'; inkOutline(ctx);
        const leaf = (dx, dy, rot) => {
          ctx.save(); ctx.translate(dx, dy); ctx.rotate(rot);
          ctx.beginPath();
          ctx.moveTo(-14, 0);
          ctx.bezierCurveTo(-7, -12, 7, -12, 14, 0);
          ctx.bezierCurveTo(7, 10, -7, 10, -14, 0);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        };
        leaf(-13, -r * 0.55, -0.32);
        leaf(13, -r * 0.55, 0.32);
        // berries
        ctx.fillStyle = '#c1233b';
        for (const [dx, dy] of [[-5, -r * 0.62], [5, -r * 0.66], [0, -r * 0.5]]) {
          ctx.beginPath(); ctx.arc(dx, dy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      },
    },
    { // 10  THE TRIFLE
      name: 'The Haileybury Trifle',
      radius: 122, color: "#fff7e0",
      draw(ctx, r, seed) {
        // glass bowl
        ctx.fillStyle = 'rgba(255,255,255,.55)'; inkOutline(ctx, 3);
        ctx.beginPath();
        ctx.moveTo(-r * 0.95, -r * 0.4);
        ctx.lineTo(-r * 0.78, r * 0.85);
        ctx.quadraticCurveTo(0, r * 1.05, r * 0.78, r * 0.85);
        ctx.lineTo(r * 0.95, -r * 0.4);
        ctx.quadraticCurveTo(0, -r * 0.6, -r * 0.95, -r * 0.4);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // sponge layer (bottom, browny)
        ctx.fillStyle = '#c98c4f';
        ctx.beginPath();
        ctx.moveTo(-r * 0.82, r * 0.35);
        ctx.lineTo(-r * 0.78, r * 0.85);
        ctx.quadraticCurveTo(0, r * 1.0, r * 0.78, r * 0.85);
        ctx.lineTo(r * 0.82, r * 0.35);
        ctx.quadraticCurveTo(0, r * 0.5, -r * 0.82, r * 0.35);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // jelly layer (red)
        ctx.fillStyle = '#c1233b';
        ctx.beginPath();
        ctx.moveTo(-r * 0.86, 0);
        ctx.lineTo(-r * 0.82, r * 0.35);
        ctx.quadraticCurveTo(0, r * 0.48, r * 0.82, r * 0.35);
        ctx.lineTo(r * 0.86, 0);
        ctx.quadraticCurveTo(0, -r * 0.05, -r * 0.86, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // custard layer (yellow)
        ctx.fillStyle = '#f5d35a';
        ctx.beginPath();
        ctx.moveTo(-r * 0.88, -r * 0.22);
        ctx.lineTo(-r * 0.86, 0);
        ctx.quadraticCurveTo(0, -r * 0.1, r * 0.86, 0);
        ctx.lineTo(r * 0.88, -r * 0.22);
        ctx.quadraticCurveTo(0, -r * 0.32, -r * 0.88, -r * 0.22);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // cream layer
        ctx.fillStyle = '#fff7df';
        ctx.beginPath();
        ctx.moveTo(-r * 0.92, -r * 0.46);
        ctx.quadraticCurveTo(-r * 0.5, -r * 0.56, 0, -r * 0.5);
        ctx.quadraticCurveTo(r * 0.5, -r * 0.56, r * 0.92, -r * 0.46);
        ctx.lineTo(r * 0.88, -r * 0.22);
        ctx.quadraticCurveTo(0, -r * 0.36, -r * 0.88, -r * 0.22);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        // whipped peaks
        ctx.fillStyle = '#fff';
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(i * r * 0.22, -r * 0.46);
          ctx.bezierCurveTo(i * r * 0.22 - 7, -r * 0.72, i * r * 0.22 + 7, -r * 0.72, i * r * 0.22, -r * 0.46);
          ctx.fill(); ctx.stroke();
        }

        // hundreds-and-thousands
        const rng = mulberry(seed);
        const colors = ['#c1233b', '#3b6dc1', '#f5d35a', '#3f9c2e', '#a040c0', '#fff', '#ed8a23'];
        for (let i = 0; i < 36; i++) {
          ctx.fillStyle = colors[i % colors.length];
          const px = -r * 0.7 + rng() * r * 1.4;
          const py = -r * 0.62 + rng() * r * 0.18;
          ctx.fillRect(px, py, 3.2, 1.7);
        }

        // cherry on top
        ctx.fillStyle = '#c1233b'; inkOutline(ctx, 2);
        ctx.beginPath(); ctx.arc(0, -r * 0.72, r * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#3a1e0c'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.8);
        ctx.quadraticCurveTo(r * 0.1, -r * 0.95, r * 0.16, -r * 0.92);
        ctx.stroke();
        ctx.fillStyle = '#3f7a2c';
        ctx.beginPath();
        ctx.ellipse(r * 0.18, -r * 0.92, 5, 2.4, 0.4, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // HAILEYBURY ribbon
        ctx.fillStyle = '#7a1f2b'; inkOutline(ctx);
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, r * 0.6);
        ctx.quadraticCurveTo(0, r * 0.75, r * 0.85, r * 0.6);
        ctx.lineTo(r * 0.83, r * 0.72);
        ctx.quadraticCurveTo(0, r * 0.85, -r * 0.83, r * 0.72);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8a44a';
        ctx.font = "bold 22px 'Caveat', cursive";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('HAILEYBURY', 0, r * 0.71);
      },
    },

    // ============================================================
    // POWER-UPS (don't follow normal merge rules; handled in collisionStart)
    // ============================================================
    { // 11 — GOLDEN APPLE: merges with anything to bump it up one tier
      name: 'Golden Apple',
      radius: 30, color: '#f1c84f',
      special: 'apple',
      draw(ctx, r, seed) {
        // pulsing golden glow
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
        grad.addColorStop(0, 'rgba(255,230,120,.6)');
        grad.addColorStop(1, 'rgba(255,230,120,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
        // apple body
        ctx.fillStyle = this.color; inkOutline(ctx, 2.2);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.85);
        ctx.bezierCurveTo(r, -r * 0.85, r * 1.05, r * 0.85, 0, r * 0.85);
        ctx.bezierCurveTo(-r * 1.05, r * 0.85, -r, -r * 0.85, 0, -r * 0.85);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // gold sheen
        ctx.fillStyle = '#fff5b8';
        ctx.beginPath();
        ctx.ellipse(-r * 0.35, -r * 0.35, r * 0.32, r * 0.12, -0.4, 0, Math.PI * 2);
        ctx.fill();
        // stem
        ctx.strokeStyle = '#3a1e0c'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.85); ctx.quadraticCurveTo(6, -r * 1.1, 14, -r * 1.05);
        ctx.stroke();
        // tiny leaf
        ctx.fillStyle = '#3f7a2c'; inkOutline(ctx, 1.4);
        ctx.beginPath();
        ctx.ellipse(16, -r * 1.05, 7, 3, 0.5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      },
    },
    { // 12 — BURSAR'S BOMBSHELL: explodes on impact, knocks foods around
      name: "Bursar's Bombshell",
      radius: 34, color: '#1a1108',
      special: 'bomb',
      draw(ctx, r, seed) {
        // body
        ctx.fillStyle = this.color; inkOutline(ctx);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // shine
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.32, r * 0.12, -0.4, 0, Math.PI * 2);
        ctx.fill();
        // fuse cap
        ctx.fillStyle = '#3a1e0c';
        ctx.beginPath();
        ctx.rect(-r * 0.18, -r * 0.95, r * 0.36, r * 0.18);
        ctx.fill(); ctx.stroke();
        // sparking fuse
        ctx.strokeStyle = '#3a1e0c'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.95);
        ctx.quadraticCurveTo(8, -r * 1.2, 14, -r * 1.05);
        ctx.stroke();
        // spark
        ctx.fillStyle = '#ffd25a';
        ctx.beginPath(); ctx.arc(14, -r * 1.05, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,200,40,.6)';
        ctx.beginPath(); ctx.arc(14, -r * 1.05, 7, 0, Math.PI * 2); ctx.fill();
        // skull-and-crossbones-ish ☠ — a nod to the comedy bomb
        ctx.fillStyle = '#c8a44a';
        ctx.font = "bold 20px 'Caveat', cursive";
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('£', 0, r * 0.05);  // pound sign — Bursar's bomb!
      },
    },
  ];

  const APPLE_TIER = 11;
  const BOMB_TIER = 12;
  const NORMAL_TIERS = 11;   // tiers 0..10 are the regular merge chain

  // ----- Pre-render food sprites to offscreen canvases ---------------------
  const foodSprites = FOODS.map((food, i) => {
    const pad = 28;
    // generous bounds: christmas pud has flames above, chicken has legs below
    const sz = Math.ceil(food.radius * 3.2 + pad * 2);
    const c = document.createElement('canvas');
    c.width = sz; c.height = sz;
    const cx = c.getContext('2d');
    cx.translate(sz / 2, sz / 2);
    food.draw(cx, food.radius, 9171 + i * 137);
    return c;
  });

  // ============================================================
  // BACKGROUND — the dining hall (drawn once, blitted each frame)
  // ============================================================
  // Filled by paintHall — list of eye centres + flags so we can re-draw
  // pupils each frame so they follow the ladle.
  const portraitEyes = [];
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;

  // Mr Wade's portrait is the only one painted from life. The headshot is
  // drawn into the bottom-right portrait frame as soon as it loads — until
  // then we render the procedural fallback so the hall isn't blank.
  const headshotImg = new Image();
  headshotImg.src = 'Headshot.jpg';
  headshotImg.onload = () => paintHall(bg.getContext('2d'));

  paintHall(bg.getContext('2d'));

  function paintHall(c) {
    // Reset eye registry — paintHall may run twice (once before the headshot
    // loads, once after) and we don't want stale entries doubling up.
    portraitEyes.length = 0;
    c.clearRect(0, 0, W, H);
    // ============================
    // BARREL-VAULTED DOME (top ~220px) — based on Haileybury dining hall reference
    // ============================
    // dome ceiling cream gradient
    const domeGrad = c.createRadialGradient(W / 2, 220, 60, W / 2, 0, 480);
    domeGrad.addColorStop(0, '#f9eccb');
    domeGrad.addColorStop(0.6, '#f1dfb0');
    domeGrad.addColorStop(1, '#dcc486');
    c.fillStyle = domeGrad;
    c.fillRect(0, 0, W, 230);

    // dome ribs (curving from edges down to wainscot)
    c.strokeStyle = 'rgba(155,110,55,.45)'; c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, 0); c.bezierCurveTo(80, 60, 180, 180, 220, 220);
    c.stroke();
    c.beginPath();
    c.moveTo(W, 0); c.bezierCurveTo(W - 80, 60, W - 180, 180, W - 220, 220);
    c.stroke();
    // soft rib highlight
    c.strokeStyle = 'rgba(255,250,220,.5)'; c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(2, 2); c.bezierCurveTo(82, 62, 182, 182, 222, 222); c.stroke();

    // PILGRIM'S PROGRESS inscription running around the dome base curve
    c.save();
    c.fillStyle = '#9b6a26';
    c.font = "bold 13px 'Special Elite', monospace";
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const inscription =
      "MY MARKS AND SCARS I CARRY WITH ME · TO BE A WITNESS FOR ME · " +
      "THAT I HAVE FOUGHT HIS BATTLES · WHO NOW WILL BE MY REWARDER";
    // curved baseline: shallow arch from (60,72) to (W-60,72) peaking at (W/2,40)
    const chars = inscription.split('');
    const totalLen = chars.length;
    for (let i = 0; i < totalLen; i++) {
      const t = i / (totalLen - 1);
      // arch: y = 40 + 32*(2t-1)^2, x = 60 + (W-120)*t
      const x = 60 + (W - 120) * t;
      const y = 40 + 32 * Math.pow(2 * t - 1, 2);
      // tangent angle for rotation
      const dy = 64 * (2 * t - 1) / (W - 120);
      c.save();
      c.translate(x, y);
      c.rotate(Math.atan2(dy * (W - 120), 1) * 0.6);
      c.fillText(chars[i], 0, 0);
      c.restore();
    }
    c.restore();

    // plaster roundels with crests on the dome
    const drawRoundel = (cx, cy, r, accent) => {
      c.fillStyle = '#fff'; inkOutline(c, 2);
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#e7d8a8';
      c.beginPath(); c.arc(cx, cy, r - 3, 0, Math.PI * 2); c.fill();
      // tiny shield in middle
      c.fillStyle = accent;
      c.beginPath();
      c.moveTo(cx - r * 0.45, cy - r * 0.5);
      c.lineTo(cx + r * 0.45, cy - r * 0.5);
      c.lineTo(cx + r * 0.45, cy + r * 0.1);
      c.quadraticCurveTo(cx, cy + r * 0.7, cx - r * 0.45, cy + r * 0.1);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#c8a44a';
      c.font = "bold 11px 'Caveat', cursive";
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('H', cx, cy + 1);
    };
    drawRoundel(110, 130, 22, '#7a1f2b');
    drawRoundel(W - 110, 130, 22, '#7a1f2b');

    // ====== Apse with arched windows behind the chandelier (centre top) ======
    // apse curved back wall (lighter cream)
    c.fillStyle = '#fffadc';
    c.beginPath();
    c.moveTo(W / 2 - 130, 220);
    c.bezierCurveTo(W / 2 - 130, 60, W / 2 + 130, 60, W / 2 + 130, 220);
    c.closePath(); c.fill();
    inkOutline(c, 2); c.stroke();
    // 5 small arched windows
    for (let i = 0; i < 5; i++) {
      const wx = W / 2 - 90 + i * 45;
      const wy = 105;
      const ww = 22, wh = 70;
      // window light
      const winGrad = c.createLinearGradient(0, wy, 0, wy + wh);
      winGrad.addColorStop(0, '#fff5b8');
      winGrad.addColorStop(1, '#e9d68a');
      c.fillStyle = winGrad;
      c.beginPath();
      c.moveTo(wx, wy + wh);
      c.lineTo(wx, wy + ww * 0.5);
      c.bezierCurveTo(wx, wy, wx + ww, wy, wx + ww, wy + ww * 0.5);
      c.lineTo(wx + ww, wy + wh);
      c.closePath(); c.fill();
      c.strokeStyle = '#3a1e0c'; c.lineWidth = 1.4;
      c.stroke();
      // mullion cross
      c.beginPath();
      c.moveTo(wx + ww / 2, wy + 5); c.lineTo(wx + ww / 2, wy + wh);
      c.moveTo(wx, wy + wh * 0.55); c.lineTo(wx + ww, wy + wh * 0.55);
      c.stroke();
    }
    // little crests above the apse windows
    for (let i = 0; i < 4; i++) {
      const cx = W / 2 - 70 + i * 45;
      c.fillStyle = '#7a1f2b';
      c.beginPath(); c.arc(cx, 90, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c8a44a';
      c.font = "bold 9px 'Caveat', cursive";
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('H', cx, 91);
    }

    // (CHANDELIER drawn dynamically each frame in drawChandelier so it can sway)

    // ============================
    // DARK MAHOGANY WAINSCOTING & WALLS (sides + gap below banner)
    // ============================
    const woodGrad = c.createLinearGradient(0, 215, 0, H);
    woodGrad.addColorStop(0, '#3a2412');
    woodGrad.addColorStop(0.5, '#4a2a14');
    woodGrad.addColorStop(1, '#2b170a');
    c.fillStyle = woodGrad;
    c.fillRect(0, 215, PLAY_LEFT - 18, H - 215);
    c.fillRect(PLAY_RIGHT + 18, 215, W - (PLAY_RIGHT + 18), H - 215);

    // wood panel raised-detail on the sides — vertical panels with bevels
    const drawPanel = (px, py, pw, ph) => {
      // panel base
      c.fillStyle = '#3e2210';
      c.fillRect(px, py, pw, ph);
      // bevel highlight (top-left)
      c.fillStyle = 'rgba(255,210,150,.18)';
      c.beginPath();
      c.moveTo(px + 3, py + 3); c.lineTo(px + pw - 3, py + 3);
      c.lineTo(px + pw - 6, py + 6); c.lineTo(px + 6, py + 6);
      c.lineTo(px + 6, py + ph - 6); c.lineTo(px + 3, py + ph - 3);
      c.closePath(); c.fill();
      // bevel shadow (bottom-right)
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath();
      c.moveTo(px + pw - 3, py + 3); c.lineTo(px + pw - 3, py + ph - 3);
      c.lineTo(px + 3, py + ph - 3); c.lineTo(px + 6, py + ph - 6);
      c.lineTo(px + pw - 6, py + ph - 6); c.lineTo(px + pw - 6, py + 6);
      c.closePath(); c.fill();
    };
    // left and right panel rows (2 columns each side)
    for (let row = 0; row < 4; row++) {
      const py = 230 + row * 175;
      // left
      drawPanel(8, py, 60, 165);
      drawPanel(74, py, 60, 165);
      // right
      drawPanel(W - 134, py, 60, 165);
      drawPanel(W - 68, py, 60, 165);
    }

    // wall sconce lights (cone of warm glow on dark wood) — 3 per side
    const sconce = (sx, sy) => {
      // glow
      const g = c.createRadialGradient(sx, sy, 4, sx, sy, 80);
      g.addColorStop(0, 'rgba(255,210,120,.65)');
      g.addColorStop(1, 'rgba(255,210,120,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(sx, sy, 80, 0, Math.PI * 2); c.fill();
      // sconce bracket
      c.fillStyle = '#c8a44a'; inkOutline(c, 1.5);
      c.beginPath();
      c.arc(sx, sy, 7, 0, Math.PI * 2); c.fill(); c.stroke();
      // candle bulb
      c.fillStyle = '#fff5b8';
      c.beginPath(); c.arc(sx, sy - 2, 4, 0, Math.PI * 2); c.fill();
    };
    // 3 sconces a side, sitting just above each portrait
    for (let i = 0; i < 3; i++) {
      const sy = 348 + i * 190;
      sconce(72, sy);
      sconce(W - 72, sy);
    }

    // ============================
    // HEADMASTER PORTRAITS in gilded frames (between sconces).
    // Bottom row sits above the dining table so Mr Wade is fully visible.
    // ============================
    const portraits = [
      [16, 360], [16, 545], [16, 730],
      [W - 124, 360], [W - 124, 545], [W - 124, 730],
    ];
    // Real Masters of Haileybury — five from history, plus Mr Wade in slot 6.
    const portraitNames = [
      "Sholto Black '42",        // top-left      (Sholto Black, 1942-1953)
      "Bill Stewart '62",        // middle-left   (William 'Bill' Stewart, 1962-1975)
      "D. Summerscale '76",      // bottom-left   (David Summerscale, 1976-1986)
      "Stuart Westley '99",      // top-right     (Stuart Westley, 1999-2009)
      "Martin Collier '17",      // middle-right  (Martin Collier, 2017-2024)
      'Mr Wade · 2026',          // bottom-right  (the only one painted from life)
    ];
    portraits.forEach(([px, py], idx) => {
      // outer gilded frame
      c.fillStyle = '#d4ad58';
      c.fillRect(px, py, 108, 150);
      c.fillStyle = '#9b7a2c';
      c.fillRect(px + 5, py + 5, 98, 140);
      c.fillStyle = '#c8a44a';
      c.fillRect(px + 8, py + 8, 92, 134);
      // canvas (dark with browns)
      const canvasGrad = c.createLinearGradient(px, py, px, py + 150);
      canvasGrad.addColorStop(0, '#2a1a0e');
      canvasGrad.addColorStop(1, '#5a3416');
      c.fillStyle = canvasGrad;
      c.fillRect(px + 11, py + 11, 86, 128);

      if (idx === 5 && headshotImg.complete && headshotImg.naturalWidth > 0) {
        // ====== MR WADE — actual headshot, painted from life ======
        // Draw the photo into the canvas area of the frame using a centred
        // "cover" crop so the face fills the portrait without distortion.
        const fx = px + 11, fy = py + 11, fw = 86, fh = 128;
        const iw = headshotImg.naturalWidth, ih = headshotImg.naturalHeight;
        const targetAspect = fw / fh;
        const srcAspect = iw / ih;
        let sx, sy, sw, sh;
        if (srcAspect > targetAspect) {
          // photo wider than frame — crop sides
          sh = ih;
          sw = ih * targetAspect;
          sx = (iw - sw) / 2;
          sy = 0;
        } else {
          // photo taller than frame — crop top/bottom (favour the face,
          // which sits in the upper third)
          sw = iw;
          sh = iw / targetAspect;
          sx = 0;
          sy = Math.max(0, (ih - sh) * 0.18);
        }
        c.drawImage(headshotImg, sx, sy, sw, sh, fx, fy, fw, fh);
        // subtle warm overlay so the photo sits with the painted portraits
        c.fillStyle = 'rgba(80,40,10,.08)';
        c.fillRect(fx, fy, fw, fh);
      } else if (idx === 5) {
        // ====== MR WADE — procedural fallback while the photo loads ======
        const cx = px + 54, cy = py + 62;
        // shoulders / open-collar dark blazer
        c.fillStyle = '#1f2a3a';
        c.beginPath();
        c.moveTo(px + 18, py + 138);
        c.quadraticCurveTo(px + 22, py + 92, px + 36, py + 84);
        c.lineTo(px + 72, py + 84);
        c.quadraticCurveTo(px + 86, py + 92, px + 90, py + 138);
        c.closePath(); c.fill();
        // shirt (open collar, no tie)
        c.fillStyle = '#f4f0e3';
        c.beginPath();
        c.moveTo(px + 44, py + 86); c.lineTo(px + 64, py + 86);
        c.lineTo(px + 60, py + 100); c.lineTo(px + 48, py + 100);
        c.closePath(); c.fill();
        // blazer lapels on top of shirt
        c.fillStyle = '#1a2230';
        c.beginPath();
        c.moveTo(px + 38, py + 88); c.lineTo(px + 48, py + 100); c.lineTo(px + 44, py + 110);
        c.lineTo(px + 36, py + 100); c.closePath(); c.fill();
        c.beginPath();
        c.moveTo(px + 70, py + 88); c.lineTo(px + 60, py + 100); c.lineTo(px + 64, py + 110);
        c.lineTo(px + 72, py + 100); c.closePath(); c.fill();
        // neck
        c.fillStyle = '#dba87a';
        c.fillRect(cx - 6, cy + 18, 12, 8);
        // face — slightly oval
        c.fillStyle = '#e8c39a';
        c.beginPath();
        c.ellipse(cx, cy, 17, 20, 0, 0, Math.PI * 2);
        c.fill();
        // jaw shadow
        c.fillStyle = 'rgba(110,70,30,.18)';
        c.beginPath();
        c.ellipse(cx, cy + 6, 16, 14, 0, 0, Math.PI * 2);
        c.fill();
        // hair — light-brown, swept slightly
        c.fillStyle = '#8b5a2a';
        c.beginPath();
        c.moveTo(cx - 17, cy - 10);
        c.bezierCurveTo(cx - 19, cy - 26, cx - 4, cy - 28, cx + 6, cy - 22);
        c.bezierCurveTo(cx + 14, cy - 26, cx + 19, cy - 14, cx + 17, cy - 6);
        c.bezierCurveTo(cx + 12, cy - 12, cx + 4, cy - 14, cx - 4, cy - 12);
        c.bezierCurveTo(cx - 12, cy - 10, cx - 16, cy - 6, cx - 17, cy - 10);
        c.closePath(); c.fill();
        // hair highlight
        c.fillStyle = '#a47140';
        c.beginPath();
        c.ellipse(cx + 4, cy - 18, 6, 2, -0.2, 0, Math.PI * 2);
        c.fill();
        // beard — trimmed reddish-brown along the jaw
        c.fillStyle = '#7a4a26';
        c.beginPath();
        c.moveTo(cx - 14, cy + 4);
        c.bezierCurveTo(cx - 16, cy + 14, cx - 4, cy + 19, cx, cy + 19);
        c.bezierCurveTo(cx + 4, cy + 19, cx + 16, cy + 14, cx + 14, cy + 4);
        c.bezierCurveTo(cx + 8, cy + 8, cx - 8, cy + 8, cx - 14, cy + 4);
        c.closePath(); c.fill();
        // moustache joining the beard
        c.beginPath();
        c.ellipse(cx - 4, cy + 4, 4, 1.6, -0.2, 0, Math.PI * 2);
        c.ellipse(cx + 4, cy + 4, 4, 1.6, 0.2, 0, Math.PI * 2);
        c.fill();
        // mouth — friendly half-smile peeking through the beard
        c.strokeStyle = '#5a2a1b'; c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(cx - 4, cy + 8);
        c.quadraticCurveTo(cx, cy + 11, cx + 4, cy + 8);
        c.stroke();
        // eyebrows
        c.strokeStyle = '#5a3416'; c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(cx - 11, cy - 8); c.quadraticCurveTo(cx - 6, cy - 10, cx - 2, cy - 8);
        c.moveTo(cx + 2, cy - 8);  c.quadraticCurveTo(cx + 6, cy - 10, cx + 11, cy - 8);
        c.stroke();
        // glasses — dark frames, square-ish
        c.strokeStyle = '#1a1108'; c.lineWidth = 2;
        c.beginPath();
        c.rect(cx - 12, cy - 6, 9, 7);
        c.rect(cx + 3, cy - 6, 9, 7);
        // bridge
        c.moveTo(cx - 3, cy - 3); c.lineTo(cx + 3, cy - 3);
        // arms
        c.moveTo(cx - 12, cy - 4); c.lineTo(cx - 17, cy - 3);
        c.moveTo(cx + 12, cy - 4); c.lineTo(cx + 17, cy - 3);
        c.stroke();
        // (eyes intentionally NOT drawn here — added each frame so they
        //  follow the ladle. Lens center coords pushed below.)
        portraitEyes.push({
          mrWade: true,
          ex: cx - 7, ey: cy - 2,    // left lens centre
          lx: cx + 7, ly: cy - 2,    // right lens centre
          maxShift: 1.6,
        });
        // a tiny lanyard touch (Mr Wade had one in the photo)
        c.strokeStyle = '#6c7a4a'; c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(cx - 6, cy + 22); c.quadraticCurveTo(cx - 12, cy + 28, cx - 8, cy + 38);
        c.moveTo(cx + 6, cy + 22); c.quadraticCurveTo(cx + 12, cy + 28, cx + 8, cy + 38);
        c.stroke();
        c.fillStyle = '#c8a44a';
        c.fillRect(cx - 5, cy + 36, 10, 6);
      } else {
        // ====== Generic Master, varied per slot ======
        // Each slot gets a distinct face — hair colour & style, facial hair,
        // glasses, skin tone, gown colour, and expression — so the gallery
        // reads as five different people.
        const profiles = [
          { // 0  Sholto Black 1942 — dark hair side-parted, clean-shaven, stern
            skin:'#dbb38a', hair:'#2e1f10', hairStyle:'side-parted',
            facialHair:'none',  glasses:false, mouth:'stern',
            gown:'#1a1108',     collar:'high', tieColor:null,
            faceShape:'oval',
          },
          { // 1  Bill Stewart 1962 — greying side-part, glasses, half-smile
            skin:'#e8c4a0', hair:'#7a6a5a', hairStyle:'side-parted',
            facialHair:'moustache', glasses:true,  mouth:'half-smile',
            gown:'#2b170a',     collar:'modern', tieColor:'#3b6dc1',
            faceShape:'round',
          },
          { // 2  D. Summerscale 1976 — dark wavy hair, bushy sideburns, neutral
            skin:'#cf9b6c', hair:'#3a2412', hairStyle:'tousled',
            facialHair:'sideburns', glasses:false, mouth:'neutral',
            gown:'#1a1108',     collar:'modern', tieColor:'#7a1f2b',
            faceShape:'oval',
          },
          { // 3  Stuart Westley 1999 — receding sandy hair, no glasses, smile
            skin:'#dab297', hair:'#9a8366', hairStyle:'receding',
            facialHair:'none',  glasses:false, mouth:'half-smile',
            gown:'#2b3340',     collar:'modern', tieColor:'#6c7a4a',
            faceShape:'long',
          },
          { // 4  Martin Collier 2017 — salt-and-pepper, glasses, neat beard
            skin:'#e0bb95', hair:'#6c6660', hairStyle:'swept-back',
            facialHair:'short-beard', glasses:true,  mouth:'smile',
            gown:'#23272e',     collar:'modern', tieColor:'#c8a44a',
            faceShape:'oval',
          },
        ];
        const p = profiles[idx];
        const cx = px + 54, cy = py + 62;

        // gown
        c.fillStyle = p.gown;
        c.beginPath();
        c.moveTo(px + 22, py + 138); c.lineTo(px + 32, py + 80);
        c.lineTo(px + 76, py + 80); c.lineTo(px + 86, py + 138);
        c.closePath(); c.fill();

        // gown lapels for modern collars
        if (p.collar === 'modern') {
          c.fillStyle = 'rgba(0,0,0,.35)';
          c.beginPath();
          c.moveTo(px + 38, py + 86); c.lineTo(px + 50, py + 100);
          c.lineTo(px + 46, py + 116); c.lineTo(px + 34, py + 100);
          c.closePath(); c.fill();
          c.beginPath();
          c.moveTo(px + 70, py + 86); c.lineTo(px + 58, py + 100);
          c.lineTo(px + 62, py + 116); c.lineTo(px + 74, py + 100);
          c.closePath(); c.fill();
        }

        // collar / stock
        c.fillStyle = '#fff';
        if (p.collar === 'high') {
          c.beginPath();
          c.moveTo(px + 42, py + 80); c.lineTo(px + 66, py + 80);
          c.lineTo(px + 62, py + 96); c.lineTo(px + 46, py + 96);
          c.closePath(); c.fill();
        } else {
          c.beginPath();
          c.moveTo(px + 44, py + 82); c.lineTo(px + 64, py + 82);
          c.lineTo(px + 60, py + 96); c.lineTo(px + 48, py + 96);
          c.closePath(); c.fill();
          if (p.tieColor) {
            c.fillStyle = p.tieColor;
            c.beginPath();
            c.moveTo(px + 51, py + 92); c.lineTo(px + 57, py + 92);
            c.lineTo(px + 56, py + 116); c.lineTo(px + 52, py + 116);
            c.closePath(); c.fill();
          }
        }

        // face
        c.fillStyle = p.skin;
        const fw = p.faceShape === 'round' ? 19 : (p.faceShape === 'long' ? 15 : 17);
        const fh = p.faceShape === 'round' ? 18 : (p.faceShape === 'long' ? 22 : 20);
        c.beginPath();
        c.ellipse(cx, cy, fw, fh, 0, 0, Math.PI * 2);
        c.fill();
        // soft jaw shadow
        c.fillStyle = 'rgba(110,70,30,.16)';
        c.beginPath();
        c.ellipse(cx, cy + 6, fw - 1, fh * 0.7, 0, 0, Math.PI * 2);
        c.fill();

        // hair styles
        c.fillStyle = p.hair;
        if (p.hairStyle === 'side-parted') {
          c.beginPath();
          c.moveTo(cx - 17, cy - 10);
          c.bezierCurveTo(cx - 19, cy - 26, cx + 2, cy - 28, cx + 8, cy - 22);
          c.bezierCurveTo(cx + 14, cy - 26, cx + 19, cy - 14, cx + 17, cy - 6);
          c.bezierCurveTo(cx + 12, cy - 12, cx + 4, cy - 14, cx - 4, cy - 12);
          c.bezierCurveTo(cx - 12, cy - 10, cx - 16, cy - 6, cx - 17, cy - 10);
          c.closePath(); c.fill();
          // part line
          c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1;
          c.beginPath();
          c.moveTo(cx - 5, cy - 22); c.lineTo(cx + 5, cy - 8);
          c.stroke();
        } else if (p.hairStyle === 'tousled') {
          // wavy mop
          c.beginPath();
          c.moveTo(cx - 18, cy - 6);
          c.bezierCurveTo(cx - 22, cy - 24, cx - 6, cy - 30, cx, cy - 24);
          c.bezierCurveTo(cx + 6, cy - 30, cx + 22, cy - 24, cx + 18, cy - 6);
          c.bezierCurveTo(cx + 12, cy - 14, cx + 6, cy - 12, cx, cy - 16);
          c.bezierCurveTo(cx - 6, cy - 12, cx - 12, cy - 14, cx - 18, cy - 6);
          c.closePath(); c.fill();
        } else if (p.hairStyle === 'receding') {
          // hair only on the sides + a thin band over the temples
          c.beginPath();
          c.ellipse(cx - 13, cy - 7, 5, 10, -0.25, 0, Math.PI * 2);
          c.ellipse(cx + 13, cy - 7, 5, 10, 0.25, 0, Math.PI * 2);
          c.fill();
          c.beginPath();
          c.ellipse(cx, cy - 19, 7, 2.4, 0, 0, Math.PI * 2);
          c.fill();
        } else if (p.hairStyle === 'swept-back') {
          c.beginPath();
          c.moveTo(cx - 18, cy - 8);
          c.bezierCurveTo(cx - 16, cy - 22, cx + 16, cy - 22, cx + 18, cy - 8);
          c.bezierCurveTo(cx + 12, cy - 14, cx - 12, cy - 14, cx - 18, cy - 8);
          c.closePath(); c.fill();
          // swept lines
          c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1;
          c.beginPath();
          c.moveTo(cx - 10, cy - 18); c.quadraticCurveTo(cx, cy - 14, cx + 10, cy - 18);
          c.stroke();
        } else if (p.hairStyle === 'bald') {
          // shiny pate — just a rim
          c.fillStyle = 'rgba(255,255,255,.18)';
          c.beginPath();
          c.ellipse(cx - 4, cy - 14, 8, 3, -0.3, 0, Math.PI * 2);
          c.fill();
        }

        // facial hair
        if (p.facialHair === 'sideburns') {
          c.fillStyle = p.hair;
          c.beginPath(); c.ellipse(cx - 15, cy + 2, 4, 9, -0.25, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.ellipse(cx + 15, cy + 2, 4, 9,  0.25, 0, Math.PI * 2); c.fill();
        } else if (p.facialHair === 'moustache') {
          c.fillStyle = p.hair;
          c.beginPath(); c.ellipse(cx - 4, cy + 6, 5, 1.8, -0.2, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.ellipse(cx + 4, cy + 6, 5, 1.8,  0.2, 0, Math.PI * 2); c.fill();
        } else if (p.facialHair === 'short-beard') {
          c.fillStyle = p.hair;
          c.beginPath();
          c.moveTo(cx - 13, cy + 4);
          c.bezierCurveTo(cx - 15, cy + 14, cx - 4, cy + 19, cx, cy + 19);
          c.bezierCurveTo(cx + 4, cy + 19, cx + 15, cy + 14, cx + 13, cy + 4);
          c.bezierCurveTo(cx + 8, cy + 8, cx - 8, cy + 8, cx - 13, cy + 4);
          c.closePath(); c.fill();
          // moustache joining the beard
          c.beginPath();
          c.ellipse(cx - 4, cy + 4, 4, 1.6, -0.2, 0, Math.PI * 2);
          c.ellipse(cx + 4, cy + 4, 4, 1.6,  0.2, 0, Math.PI * 2);
          c.fill();
        }

        // mouth
        c.strokeStyle = '#3a1e0c'; c.lineWidth = 1.6;
        c.beginPath();
        if (p.mouth === 'stern') {
          c.moveTo(cx - 5, cy + 8); c.lineTo(cx + 5, cy + 8);
        } else if (p.mouth === 'half-smile') {
          c.moveTo(cx - 5, cy + 7); c.quadraticCurveTo(cx, cy + 11, cx + 5, cy + 7);
        } else if (p.mouth === 'smile') {
          c.moveTo(cx - 6, cy + 6); c.quadraticCurveTo(cx, cy + 12, cx + 6, cy + 6);
        } else { // neutral
          c.moveTo(cx - 5, cy + 8); c.quadraticCurveTo(cx, cy + 9, cx + 5, cy + 8);
        }
        c.stroke();

        // eyebrows (use hair colour, slightly bushy variation)
        c.strokeStyle = p.hair; c.lineWidth = 1.7;
        c.beginPath();
        c.moveTo(cx - 11, cy - 7); c.quadraticCurveTo(cx - 6, cy - 9, cx - 2, cy - 7);
        c.moveTo(cx + 2, cy - 7);  c.quadraticCurveTo(cx + 6, cy - 9, cx + 11, cy - 7);
        c.stroke();

        // glasses overlay
        if (p.glasses) {
          c.strokeStyle = '#1a1108'; c.lineWidth = 1.6;
          c.beginPath();
          c.arc(cx - 7, cy - 2, 4.6, 0, Math.PI * 2);
          c.arc(cx + 7, cy - 2, 4.6, 0, Math.PI * 2);
          c.moveTo(cx - 2.4, cy - 2); c.lineTo(cx + 2.4, cy - 2);
          c.moveTo(cx - 11.6, cy - 2); c.lineTo(cx - 16, cy - 1);
          c.moveTo(cx + 11.6, cy - 2); c.lineTo(cx + 16, cy - 1);
          c.stroke();
        }

        // record eye centres (eyes drawn per frame, follow ladle)
        portraitEyes.push({
          mrWade: false,
          ex: cx - 7, ey: cy - 2,
          lx: cx + 7, ly: cy - 2,
          maxShift: 1.4,
          glasses: p.glasses,
        });
      }

      // outer frame outline
      inkOutline(c, 2); c.strokeRect(px, py, 108, 150);
      // brass nameplate — wider so the real Masters' names fit
      const npX = px + 6, npY = py + 152, npW = 96, npH = 14;
      c.fillStyle = '#c8a44a';
      c.fillRect(npX, npY, npW, npH);
      c.strokeRect(npX, npY, npW, npH);
      c.fillStyle = '#2a1a0e';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      // shrink the font automatically until the name fits
      let fontSize = idx === 5 ? 12 : 10;
      do {
        c.font = idx === 5
          ? `bold ${fontSize}px 'Caveat', cursive`
          : `bold ${fontSize}px 'Special Elite', monospace`;
        if (c.measureText(portraitNames[idx]).width <= npW - 6) break;
        fontSize -= 1;
      } while (fontSize > 6);
      c.fillText(portraitNames[idx], npX + npW / 2, npY + npH / 2 + 1);
    });

    // ============================
    // TROPHY DISPLAY CASE between portraits — left side, middle
    // ============================
    const drawTrophyCase = (px, py) => {
      // glass case
      c.fillStyle = '#1a1108';
      c.fillRect(px, py, 108, 100);
      c.fillStyle = 'rgba(255,255,255,.07)';
      c.fillRect(px + 4, py + 4, 100, 92);
      // shelves
      c.strokeStyle = '#5a3416'; c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(px + 4, py + 50); c.lineTo(px + 104, py + 50);
      c.stroke();
      // trophies (cups)
      const cup = (cx, cy, h) => {
        c.fillStyle = '#c8a44a'; inkOutline(c, 1.4);
        c.beginPath();
        c.moveTo(cx - h * 0.35, cy - h * 0.5);
        c.lineTo(cx + h * 0.35, cy - h * 0.5);
        c.lineTo(cx + h * 0.2, cy + h * 0.05);
        c.lineTo(cx - h * 0.2, cy + h * 0.05);
        c.closePath(); c.fill(); c.stroke();
        // base
        c.fillRect(cx - h * 0.18, cy + h * 0.05, h * 0.36, h * 0.1);
        c.strokeRect(cx - h * 0.18, cy + h * 0.05, h * 0.36, h * 0.1);
        // handles
        c.beginPath();
        c.arc(cx - h * 0.42, cy - h * 0.25, h * 0.18, -Math.PI * 0.1, Math.PI * 1.1);
        c.stroke();
        c.beginPath();
        c.arc(cx + h * 0.42, cy - h * 0.25, h * 0.18, -Math.PI * 1.1, Math.PI * 0.1);
        c.stroke();
      };
      cup(px + 28, py + 36, 22);
      cup(px + 78, py + 38, 18);
      cup(px + 32, py + 88, 16);
      cup(px + 78, py + 86, 20);
      // frame
      c.strokeStyle = '#c8a44a'; c.lineWidth = 2;
      c.strokeRect(px, py, 108, 100);
    };
    drawTrophyCase(16, 232);
    drawTrophyCase(W - 124, 232);

    // ============================
    // SURSUM CORDA banner (just above the bowl rim)
    // ============================
    c.fillStyle = '#7a1f2b'; inkOutline(c);
    c.beginPath();
    c.moveTo(PLAY_LEFT + 30, 198); c.lineTo(PLAY_RIGHT - 30, 198);
    c.lineTo(PLAY_RIGHT - 50, 222); c.lineTo(PLAY_LEFT + 50, 222);
    c.closePath(); c.fill(); c.stroke();
    // gold trim
    c.strokeStyle = '#c8a44a'; c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(PLAY_LEFT + 36, 202); c.lineTo(PLAY_RIGHT - 36, 202);
    c.moveTo(PLAY_LEFT + 56, 218); c.lineTo(PLAY_RIGHT - 56, 218);
    c.stroke();
    c.fillStyle = '#c8a44a';
    c.font = "bold 22px 'Caveat', cursive";
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Sursum Corda — Dinner is Served', W / 2, 211);

    // ============================
    // DINING TABLE at the bottom — long oak refectory table
    // ============================
    const tableGrad = c.createLinearGradient(0, 905, 0, 1000);
    tableGrad.addColorStop(0, '#a26a32');
    tableGrad.addColorStop(0.5, '#7a4a1f');
    tableGrad.addColorStop(1, '#5b3416');
    c.fillStyle = tableGrad;
    c.fillRect(0, 905, W, 95);
    // table rail (slight darker top edge)
    c.fillStyle = '#3a1e0c'; c.fillRect(0, 905, W, 4);
    // wood grain (long, parallel)
    c.strokeStyle = 'rgba(40,20,8,.4)'; c.lineWidth = 1;
    for (let y = 915; y < 1000; y += 5) {
      c.beginPath();
      const wob = Math.sin(y * 0.41) * 1.2;
      c.moveTo(0, y); c.lineTo(W, y + wob);
      c.stroke();
    }
    // small place settings (tiny circles like distant plates)
    for (let i = 0; i < 10; i++) {
      const px = 30 + i * 92;
      if (Math.abs(px - W / 2) < 130) continue; // skip behind crest runner
      c.fillStyle = '#fbf2d4'; inkOutline(c, 1.2);
      c.beginPath(); c.ellipse(px, 970, 22, 6, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#c8a44a';
      c.beginPath(); c.ellipse(px, 970, 14, 3, 0, 0, Math.PI * 2); c.fill();
    }

    // table runner with crest in the middle
    c.fillStyle = '#7a1f2b'; inkOutline(c);
    c.beginPath();
    c.moveTo(W / 2 - 130, 920);
    c.lineTo(W / 2 + 130, 920);
    c.lineTo(W / 2 + 110, 1000);
    c.lineTo(W / 2 - 110, 1000);
    c.closePath(); c.fill(); c.stroke();
    // gold trim on runner
    c.strokeStyle = '#c8a44a'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(W / 2 - 124, 924); c.lineTo(W / 2 + 124, 924);
    c.moveTo(W / 2 - 116, 994); c.lineTo(W / 2 + 116, 994);
    c.stroke();
    // crest (shield shape)
    c.fillStyle = '#c8a44a'; inkOutline(c, 2);
    c.beginPath();
    c.moveTo(W / 2 - 22, 940); c.lineTo(W / 2 + 22, 940);
    c.lineTo(W / 2 + 22, 962);
    c.quadraticCurveTo(W / 2, 980, W / 2 - 22, 962);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#7a1f2b';
    c.font = "bold 22px 'Caveat', cursive";
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('H', W / 2, 957);
    // est + name
    c.fillStyle = '#c8a44a';
    c.font = "bold 16px 'Caveat', cursive";
    c.fillText('Haileybury · Est. 1862', W / 2, 990);

    // THE BOWL / PLATE — interior fill so the play area pops
    const bowlGrad = c.createLinearGradient(0, PLAY_TOP, 0, PLAY_BOTTOM + 40);
    bowlGrad.addColorStop(0, '#fbf2d4');
    bowlGrad.addColorStop(0.7, '#f4e2b1');
    bowlGrad.addColorStop(1, '#dcc486');
    c.fillStyle = bowlGrad;
    c.beginPath();
    c.moveTo(PLAY_LEFT - 22, PLAY_TOP - 4);
    c.lineTo(PLAY_LEFT - 28, PLAY_BOTTOM + 6);
    c.quadraticCurveTo(W / 2, PLAY_BOTTOM + 38, PLAY_RIGHT + 28, PLAY_BOTTOM + 6);
    c.lineTo(PLAY_RIGHT + 22, PLAY_TOP - 4);
    c.closePath();
    c.fill();
    inkOutline(c, 3);
    c.stroke();
    // soft inner shadow at the rim
    const rimGrad = c.createLinearGradient(0, PLAY_TOP - 4, 0, PLAY_TOP + 60);
    rimGrad.addColorStop(0, 'rgba(60,30,10,.35)');
    rimGrad.addColorStop(1, 'rgba(60,30,10,0)');
    c.fillStyle = rimGrad;
    c.fillRect(PLAY_LEFT - 18, PLAY_TOP - 2, PLAY_RIGHT - PLAY_LEFT + 36, 60);
    // bowl-side gloss
    c.strokeStyle = 'rgba(255,250,220,.55)'; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(PLAY_LEFT - 8, PLAY_TOP + 8);
    c.lineTo(PLAY_LEFT - 14, PLAY_BOTTOM - 10);
    c.stroke();
    c.strokeStyle = 'rgba(80,40,15,.25)'; c.lineWidth = 3;
    c.beginPath();
    c.moveTo(PLAY_RIGHT + 8, PLAY_TOP + 8);
    c.lineTo(PLAY_RIGHT + 14, PLAY_BOTTOM - 10);
    c.stroke();

    // dust-mote / paper grain over the whole canvas
    const rng = mulberry(42);
    c.save();
    c.globalAlpha = 0.06;
    for (let i = 0; i < 800; i++) {
      c.fillStyle = rng() < 0.5 ? '#000' : '#fff';
      c.fillRect(rng() * W, rng() * H, 1, 1);
    }
    c.restore();
  }

  // ============================================================
  // PHYSICS
  // ============================================================
  const engine = Engine.create();
  engine.world.gravity.y = 1.05;
  // More iterations = less inter-penetration, snappier resting contacts.
  engine.positionIterations = 12;
  engine.velocityIterations = 10;
  engine.constraintIterations = 4;
  const world = engine.world;

  // Walls: thick, inert, immovable. Zero restitution + high friction so
  // a stack sits against them instead of squirting out.
  const WALL_THICK = 80;
  const wallOpts = { isStatic: true, restitution: 0, friction: 0.9, frictionStatic: 1.2 };
  const ground = Bodies.rectangle(
    (PLAY_LEFT + PLAY_RIGHT) / 2,
    PLAY_BOTTOM + WALL_THICK / 2,
    (PLAY_RIGHT - PLAY_LEFT) + WALL_THICK * 2,
    WALL_THICK,
    wallOpts,
  );
  const leftW = Bodies.rectangle(
    PLAY_LEFT - WALL_THICK / 2,
    (PLAY_TOP + PLAY_BOTTOM) / 2,
    WALL_THICK,
    (PLAY_BOTTOM - PLAY_TOP) + 600,
    wallOpts,
  );
  const rightW = Bodies.rectangle(
    PLAY_RIGHT + WALL_THICK / 2,
    (PLAY_TOP + PLAY_BOTTOM) / 2,
    WALL_THICK,
    (PLAY_BOTTOM - PLAY_TOP) + 600,
    wallOpts,
  );
  World.add(world, [ground, leftW, rightW]);

  const items = new Set();
  const merging = new Set();

  function spawnAt(tier, x, y, opts = {}) {
    const f = FOODS[tier];
    const body = Bodies.circle(x, y, f.radius, {
      // Higher restitution so a freshly-dropped dish bounces around in the
      // bowl. High friction + air drag still kill it within a couple seconds
      // so the pile settles cleanly.
      restitution: 0.32,
      friction: 0.55,
      frictionStatic: 0.9,
      frictionAir: 0.0008,
      slop: 0.02,
      density: 0.0012 + tier * 0.00022,
      label: 'food',
      ...opts,
    });
    body.tier = tier;
    body.spawnedAt = performance.now();
    body.squash = 0;
    items.add(body);
    World.add(world, body);
    return body;
  }

  // Safety net — even with thick walls, fast collisions and bomb impulses
  // can occasionally squeeze a body past a wall. After every physics step
  // we sweep the items and force any escapee back inside, killing any
  // outward velocity. Vertical clamping only kicks in below the floor.
  function clampInsideBowl() {
    for (const b of items) {
      const r = FOODS[b.tier].radius;
      const minX = PLAY_LEFT + r;
      const maxX = PLAY_RIGHT - r;
      let x = b.position.x;
      let vx = b.velocity.x;
      let nudged = false;
      if (x < minX) { x = minX; if (vx < 0) vx = 0; nudged = true; }
      else if (x > maxX) { x = maxX; if (vx > 0) vx = 0; nudged = true; }
      // floor
      const maxY = PLAY_BOTTOM - r;
      let y = b.position.y;
      let vy = b.velocity.y;
      if (y > maxY) { y = maxY; if (vy > 0) vy = 0; nudged = true; }
      if (nudged) {
        Body.setPosition(b, { x, y });
        Body.setVelocity(b, { x: vx, y: vy });
      }
    }
  }

  function removeBody(b) {
    items.delete(b);
    merging.delete(b.id);
    World.remove(world, b);
  }

  Events.on(engine, 'collisionStart', (e) => {
    for (const pair of e.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      // food-vs-wall: a quick bouncy "boing" so the bowl feels physical
      if (a.label !== 'food' || b.label !== 'food') {
        const food = a.label === 'food' ? a : (b.label === 'food' ? b : null);
        if (food) {
          const v = Math.hypot(food.velocity.x, food.velocity.y);
          if (v > 2.5) playBounce(Math.min(1, v / 8));
        }
        continue;
      }

      // ----- contact "thump": squish both bodies and add a tiny shake on
      //       hard impacts. Runs even if no merge happens, so every collision
      //       feels alive.
      const speed = Math.hypot(
        (a.velocity.x - b.velocity.x), (a.velocity.y - b.velocity.y)
      );
      const impact = Math.min(1, speed / 7);
      a.squash = Math.max(a.squash, impact);
      b.squash = Math.max(b.squash, impact);
      if (impact > 0.5 && (a.tier >= 6 || b.tier >= 6)) {
        addShake(impact * 4);
        playThud();
      } else if (impact > 0.35) {
        playPop(Math.min(a.tier, b.tier));
      }

      if (merging.has(a.id) || merging.has(b.id)) continue;

      const cx = (a.position.x + b.position.x) / 2;
      const cy = (a.position.y + b.position.y) / 2;

      // ----- BURSAR'S BOMBSHELL: explode on contact with any food
      if (a.tier === BOMB_TIER || b.tier === BOMB_TIER) {
        const bomb = a.tier === BOMB_TIER ? a : b;
        const other = a.tier === BOMB_TIER ? b : a;
        merging.add(bomb.id); merging.add(other.id);
        explodeBomb(bomb, other);
        continue;
      }

      // ----- GOLDEN APPLE: bumps any normal food up one tier
      if (a.tier === APPLE_TIER || b.tier === APPLE_TIER) {
        const apple = a.tier === APPLE_TIER ? a : b;
        const other = a.tier === APPLE_TIER ? b : a;
        merging.add(apple.id); merging.add(other.id);
        if (other.tier === APPLE_TIER) {
          // Two apples — pure-gold bonus
          score += 300;
          burstParticles(cx, cy, '#fff5b8', 40, 6);
          burstParticles(cx, cy, '#c8a44a', 28, 5);
          playFanfare();
          showFlash('Two golden apples! +300');
          removeBody(apple); removeBody(other);
          continue;
        }
        // Normal target — bump it up
        const next = Math.min(NORMAL_TIERS - 1, other.tier + 1);
        const bonus = 30 + next * 10;
        const mult = registerCombo(`Golden +${bonus}`);
        score += bonus * mult;
        if (next > highestTier) { highestTier = next; updateMenuHighlight(); }
        removeBody(apple); removeBody(other);
        const nb = spawnAt(next, cx, cy);
        Body.setVelocity(nb, { x: 0, y: -1.5 });
        burstParticles(cx, cy, '#fff5b8', 26, 5);
        burstParticles(cx, cy, FOODS[next].color, 14, 3);
        playMerge(next);
        addShake(3);
        continue;
      }

      // Power-ups don't merge with each other except the apple+apple case above
      if (a.tier === BOMB_TIER || b.tier === BOMB_TIER) continue;
      if (a.tier !== b.tier) continue;

      merging.add(a.id); merging.add(b.id);

      if (a.tier >= NORMAL_TIERS - 1) {
        // Two trifles! ascend to glory
        score += 800;
        burstParticles(cx, cy, '#c8a44a', 36, 6);
        burstParticles(cx, cy, '#7a1f2b', 24, 5);
        playTrifle();
        showFlash('A double Trifle! +800');
        addShake(8);
        removeBody(a); removeBody(b);
        continue;
      }
      const next = a.tier + 1;
      // Flatter, more linear scoring: top tiers no longer dwarf early ones,
      // so a long careful run feels valued rather than out-shone by a single
      // late-game merge.
      const base = 15 + next * 12;
      const mult = registerCombo(MERGE_QUIPS[next]);
      score += base * mult;
      if (next === NORMAL_TIERS - 1) playTrifle();
      if (next > highestTier) { highestTier = next; updateMenuHighlight(); }
      removeBody(a); removeBody(b);
      const nb = spawnAt(next, cx, cy);
      Body.setVelocity(nb, { x: 0, y: -1.5 });
      nb.squash = 1;                      // newborn pop
      burstParticles(cx, cy, FOODS[next].color, 14, 3.5);
      playMerge(next);
      // Bigger merges shake the room and swing the chandelier
      if (next >= 6) {
        addShake(2 + next * 0.6);
        chandelier.swayVel += (Math.random() - 0.5) * (0.06 + next * 0.012);
      }
    }
  });

  function explodeBomb(bomb, primary) {
    const cx = bomb.position.x, cy = bomb.position.y;
    const blastInner = 90;
    const blastOuter = 220;
    let cleared = 0;
    // shock-wave: every nearby food gets an outward impulse, very-near foods vanish
    for (const body of [...items]) {
      if (body === bomb) continue;
      const dx = body.position.x - cx;
      const dy = body.position.y - cy;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < blastInner && body.tier < 8) {
        // small pieces are vapourised
        cleared++;
        score += 25;
        burstParticles(body.position.x, body.position.y, FOODS[body.tier].color, 10, 4);
        removeBody(body);
        continue;
      }
      if (d < blastOuter) {
        const force = (1 - d / blastOuter) * 0.06;
        Body.applyForce(body, body.position, {
          x: (dx / d) * force,
          y: (dy / d) * force - 0.012,    // slight upward kick
        });
        body.squash = 1;
      }
    }
    if (primary) { score += 25; cleared++; removeBody(primary); }
    removeBody(bomb);
    // visuals
    burstParticles(cx, cy, '#ffd25a', 60, 8);
    burstParticles(cx, cy, '#ed8a23', 40, 7);
    burstParticles(cx, cy, '#c1233b', 24, 6);
    addShake(14);
    playBoom();
    showFlash(`KABOOM! cleared ${cleared} +${cleared * 25}`);
  }

  // ============================================================
  // PARTICLES
  // ============================================================
  const particles = [];
  // Hard cap so a flurry of merges or chained bombs can't OOM the page.
  const MAX_PARTICLES = 500;
  function burstParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const a = Math.random() * Math.PI * 2;
      const s = (0.5 + Math.random()) * speed;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        life: 1,
        decay: 0.018 + Math.random() * 0.012,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.18; // gravity
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // AUDIO (synthesised, no assets)
  // ============================================================
  let audioCtx = null;
  let muted = false;
  function ac() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
    return audioCtx;
  }

  // ----- Background music -------------------------------------------------
  // Browsers refuse to autoplay audio without a user gesture, so the track
  // is created up front but only started inside startMusic() — which we
  // call from the first keypress / pointer / overlay-button event.
  const music = new Audio('Videogame.mp3');
  music.loop = true;
  music.volume = 0.35;
  music.preload = 'auto';
  let musicStarted = false;
  function startMusic() {
    if (musicStarted || muted) return;
    musicStarted = true;
    const p = music.play();
    if (p && typeof p.catch === 'function') {
      // Autoplay may still be blocked — leave the flag false so we retry
      // on the next gesture.
      p.catch(() => { musicStarted = false; });
    }
  }
  function setMusicMuted(m) {
    music.muted = m;
    if (!m && !musicStarted) startMusic();
  }
  // Track recently-fired tones so a flurry of merges can't spawn hundreds of
  // simultaneous oscillators (which has crashed Safari for high-combo runs).
  const _toneStamps = [];
  const TONE_BUDGET = 18;          // max tones in the sliding window
  const TONE_WINDOW_MS = 220;
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.18) {
    if (muted) return;
    const a = ac(); if (!a) return;
    const now = performance.now();
    while (_toneStamps.length && now - _toneStamps[0] > TONE_WINDOW_MS) _toneStamps.shift();
    if (_toneStamps.length >= TONE_BUDGET) return;
    _toneStamps.push(now);
    const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
    g.gain.setValueAtTime(0, a.currentTime);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur + 0.02);
  }
  function playDrop() { tone(220, 0.08, 'sine', 0.15); }
  function playMerge(tier) {
    // Climb a pentatonic scale — each tier is a step higher, so a long combo
    // builds a satisfying melodic phrase up to the trifle.
    const pentaC = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
    const f = pentaC[Math.min(tier, pentaC.length - 1)];
    tone(f, 0.12, 'triangle', 0.2);
    setTimeout(() => tone(f * 1.5, 0.14, 'sine', 0.14), 60);
  }
  function playFanfare() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => tone(f, 0.18, 'triangle', 0.22), i * 110));
  }
  function playGameOver() {
    [440, 392, 349, 294].forEach((f, i) =>
      setTimeout(() => tone(f, 0.25, 'sawtooth', 0.18), i * 160));
  }
  function playThud() {
    // soft, low percussive bump — used on hard contacts
    if (muted) return;
    const a = ac(); if (!a) return;
    const o = a.createOscillator(); const g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(48, a.currentTime + 0.18);
    g.gain.setValueAtTime(0, a.currentTime);
    g.gain.linearRampToValueAtTime(0.16, a.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.2);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + 0.22);
  }
  function playBoom() {
    if (muted) return;
    const a = ac(); if (!a) return;
    // noise burst
    const buf = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = a.createBufferSource(); src.buffer = buf;
    const g = a.createGain();
    g.gain.setValueAtTime(0.35, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.45);
    src.connect(g); g.connect(a.destination);
    src.start();
    // rumble
    tone(80, 0.4, 'square', 0.22);
  }
  function playSparkle() {
    if (muted) return;
    [880, 1320, 1760].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.14), i * 50));
  }
  // Bouncy "boing" when a fresh dish smacks the side of the bowl.
  function playBounce(impact) {
    if (muted) return;
    const f = 180 + Math.random() * 60;
    tone(f, 0.06, 'square', 0.06 + Math.min(0.1, impact * 0.06));
  }
  // Splat-pop on small-tier merges — wet, low, immediate.
  function playPop(tier) {
    if (muted) return;
    const f = 320 - Math.min(180, tier * 18);
    tone(f, 0.07, 'square', 0.12);
    setTimeout(() => tone(f * 0.6, 0.05, 'sine', 0.08), 30);
  }
  // Pigeon: comedic two-note coo as it flaps onto the screen.
  function playPigeon() {
    if (muted) return;
    tone(620, 0.12, 'sine', 0.1);
    setTimeout(() => tone(520, 0.18, 'sine', 0.12), 130);
  }
  // Combo escalator — pitch rises with the multiplier so a long chain
  // sounds genuinely thrilling.
  function playCombo(mult) {
    if (muted) return;
    const base = 440 * Math.pow(1.12, mult);
    tone(base, 0.08, 'square', 0.14);
    setTimeout(() => tone(base * 1.5, 0.08, 'triangle', 0.1), 60);
  }
  // Soft UI click for buttons and overlay actions.
  function playClick() {
    if (muted) return;
    tone(700, 0.04, 'square', 0.1);
    setTimeout(() => tone(1200, 0.04, 'sine', 0.08), 35);
  }
  // Big triumphant fanfare reserved for the Trifle.
  function playTrifle() {
    if (muted) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 110));
    setTimeout(() => tone(2093, 0.4, 'sine', 0.2), 600);
  }

  // ============================================================
  // STATE
  // ============================================================
  const MERGE_QUIPS = {
    2: 'A crouton! Crunchy.',
    3: 'Battered fish — fresh from the fryer!',
    5: 'A perfect Yorkshire — mind the gravy!',
    6: 'Behold, the jacket potato!',
    7: 'Sunday roast is served!',
    8: 'Sticky toffee — extra cream?',
    9: 'CHRISTMAS HAS COME EARLY!',
    10: 'THE HAILEYBURY TRIFLE!!',
  };
  let score = 0;
  let highestTier = -1;
  let best = Number(localStorage.getItem('haileybury-dining-best') || 0);

  // ---- Honours Board (leaderboard) ---------------------------------------
  const BOARD_KEY = 'haileybury-dining-board';
  const BOARD_NAME_KEY = 'haileybury-dining-name';
  const BOARD_LIMIT = 10;
  let leaderboard = loadBoard();
  function loadBoard() {
    try {
      const raw = localStorage.getItem(BOARD_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(r => r && typeof r.name === 'string' && Number.isFinite(r.score));
    } catch { return []; }
  }
  function saveBoard() {
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(leaderboard)); } catch {}
  }
  function recordScore(name, scoreVal) {
    const cleanName = (name || 'Anon').trim().slice(0, 14) || 'Anon';
    const entry = { name: cleanName, score: Math.floor(scoreVal), date: new Date().toISOString().slice(0, 10) };
    leaderboard.push(entry);
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, BOARD_LIMIT);
    saveBoard();
    try { localStorage.setItem(BOARD_NAME_KEY, cleanName); } catch {}
    renderHonours();
    return entry;
  }
  function lastUsedName() {
    try { return localStorage.getItem(BOARD_NAME_KEY) || ''; } catch { return ''; }
  }
  function clearBoard() {
    if (!confirm('Reset the Honours Board? This cannot be undone.')) return;
    leaderboard = [];
    saveBoard();
    renderHonours();
  }

  function renderHonours(highlightEntry) {
    const ol = document.getElementById('honours');
    ol.innerHTML = '';
    if (leaderboard.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No scores yet. Be the first to make the board!';
      ol.appendChild(li);
      return;
    }
    leaderboard.slice(0, 5).forEach((r) => {
      const li = document.createElement('li');
      const n = document.createElement('span'); n.className = 'name'; n.textContent = r.name;
      const s = document.createElement('span'); s.className = 'score'; s.textContent = r.score.toLocaleString();
      li.appendChild(n); li.appendChild(s);
      if (highlightEntry && r === highlightEntry) li.classList.add('you');
      ol.appendChild(li);
    });
  }
  function renderOverlayBoard(highlightEntry) {
    const ol = document.getElementById('ovBoard');
    ol.innerHTML = '';
    if (leaderboard.length === 0) {
      ol.classList.add('hidden');
      return;
    }
    leaderboard.forEach((r) => {
      const li = document.createElement('li');
      const n = document.createElement('span'); n.className = 'name'; n.textContent = r.name;
      const s = document.createElement('span'); s.className = 'score'; s.textContent = r.score.toLocaleString();
      li.appendChild(n); li.appendChild(s);
      if (highlightEntry && r === highlightEntry) li.classList.add('you');
      ol.appendChild(li);
    });
    ol.classList.remove('hidden');
  }
  // Initial render so the HUD card shows the board on page load
  renderHonours();
  document.getElementById('resetBoard').addEventListener('click', () => { playClick(); clearBoard(); });

  // ---- Combo system (chained merges within COMBO_WINDOW ms) --------------
  const COMBO_WINDOW = 1700;
  let comboMultiplier = 1;
  let lastMergeAt = 0;
  const MAX_COMBO = 8;
  function registerCombo(quip) {
    const now = performance.now();
    comboMultiplier = (now - lastMergeAt < COMBO_WINDOW) ? Math.min(MAX_COMBO, comboMultiplier + 1) : 1;
    lastMergeAt = now;
    if (comboMultiplier > 1) {
      const labels = ['', '', 'TWO!', 'THREE!', 'FOUR! ON FIRE', 'FIVE!! GLORIOUS', 'SIX!!! UNHEARD OF', 'COMBO X' + comboMultiplier];
      showFlash(`x${comboMultiplier} ${labels[Math.min(comboMultiplier, labels.length - 1)] || ''}`.trim());
      playSparkle();
      playCombo(comboMultiplier);
    } else if (quip) {
      showFlash(quip);
    }
    return comboMultiplier;
  }

  // ---- Camera shake -------------------------------------------------------
  let shakeMag = 0;
  let shakeX = 0, shakeY = 0;
  function addShake(amount) { shakeMag = Math.min(20, shakeMag + amount); }
  function updateShake() {
    if (shakeMag < 0.3) { shakeMag = 0; shakeX = 0; shakeY = 0; return; }
    shakeX = (Math.random() - 0.5) * shakeMag * 2;
    shakeY = (Math.random() - 0.5) * shakeMag * 2;
    shakeMag *= 0.84;
  }

  // ---- Chandelier (sways with big merges) --------------------------------
  const chandelier = { angle: 0, vel: 0, swayVel: 0 };
  // expose swayVel via a getter/setter that just adds it onto vel cleanly
  Object.defineProperty(chandelier, 'swayVel', {
    set(v) { chandelier.vel += v; },
    get() { return chandelier.vel; },
  });
  function updateChandelier(dt) {
    // simple damped harmonic motion: pendulum
    const k = 6, damp = 1.4;
    chandelier.vel += -k * chandelier.angle * dt - damp * chandelier.vel * dt;
    chandelier.angle += chandelier.vel * dt;
  }

  // ---- The Pigeon (occasional comedic visitor) ---------------------------
  const pigeon = { active: false, x: 0, y: 0, vx: 0, t: 0, holding: null };
  let nextPigeonAt = performance.now() + 18000 + Math.random() * 12000;
  function maybeSpawnPigeon() {
    if (pigeon.active) return;
    if (performance.now() < nextPigeonAt) return;
    pigeon.active = true;
    pigeon.t = 0;
    const fromLeft = Math.random() < 0.5;
    pigeon.x = fromLeft ? -60 : W + 60;
    pigeon.y = 110 + Math.random() * 60;
    pigeon.vx = fromLeft ? 3.2 : -3.2;
    pigeon.holding = null;
    nextPigeonAt = performance.now() + 28000 + Math.random() * 18000;
    playPigeon();
  }
  function updatePigeon(dt) {
    if (!pigeon.active) return;
    pigeon.t += dt;
    pigeon.x += pigeon.vx;
    // dip to grab a pea around the middle of the visit, climb out the other side
    const phase = pigeon.t;
    if (phase < 1.0) pigeon.y += 1.4;
    else pigeon.y -= 1.6;
    // try to nick a pea (tier 0) at the dip
    if (!pigeon.holding && phase > 0.8 && phase < 1.4) {
      let target = null, bestD = 80;
      for (const b of items) {
        if (b.tier !== 0) continue;
        const d = Math.hypot(b.position.x - pigeon.x, b.position.y - pigeon.y);
        if (d < bestD) { bestD = d; target = b; }
      }
      if (target) {
        pigeon.holding = { tier: target.tier };
        score = Math.max(0, score - 5);   // tiny penalty
        burstParticles(target.position.x, target.position.y, '#7fb83a', 8, 3);
        removeBody(target);
        showFlash('A pigeon nicked a pea!');
      }
    }
    if (pigeon.x < -120 || pigeon.x > W + 120) pigeon.active = false;
  }
  function drawPigeon() {
    if (!pigeon.active) return;
    const x = pigeon.x, y = pigeon.y;
    const flap = Math.sin(pigeon.t * 14) * 0.6;
    ctx.save();
    ctx.translate(x, y);
    if (pigeon.vx < 0) ctx.scale(-1, 1);   // face direction of travel
    // body
    ctx.fillStyle = '#8a93a4'; inkOutline(ctx, 1.8);
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(18, -6, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // beak
    ctx.fillStyle = '#e9b04a';
    ctx.beginPath();
    ctx.moveTo(26, -6); ctx.lineTo(34, -4); ctx.lineTo(26, -2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // eye
    ctx.fillStyle = '#1a1108';
    ctx.beginPath(); ctx.arc(20, -7, 1.8, 0, Math.PI * 2); ctx.fill();
    // wing (flapping)
    ctx.fillStyle = '#6c7585';
    ctx.beginPath();
    ctx.ellipse(-2, -6 + flap * 6, 14, 6 + flap * 4, -0.2 + flap * 0.4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // legs
    ctx.strokeStyle = '#e9b04a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(-4, 18); ctx.moveTo(4, 12); ctx.lineTo(4, 18); ctx.stroke();
    // pea in beak (if stolen)
    if (pigeon.holding) {
      ctx.fillStyle = '#7fb83a'; inkOutline(ctx, 1.4);
      ctx.beginPath(); ctx.arc(36, -4, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  let nextTier = randomNextTier();
  let queuedTier = randomNextTier();
  let ladleX = (PLAY_LEFT + PLAY_RIGHT) / 2;
  let ladleVX = 0;
  let dropCooldown = 0;
  let paused = false;
  let started = false;
  let gameOver = false;
  let dangerStart = 0;
  let flashText = null; let flashUntil = 0;

  function randomNextTier() {
    // small chance of a power-up dropping into the queue
    const s = Math.random();
    if (s < 1 / 90) return APPLE_TIER;   // ~1 in 90 drops
    if (s < 1 / 90 + 1 / 110) return BOMB_TIER; // ~1 in 110 drops

    // The drop pool widens as the player climbs the menu. Once you've made
    // a Sunday Roast (tier 7), Yorkshire Puds start appearing in the ladle;
    // sticky-toffee unlocks Jackets, Christmas pud unlocks Roasts. We cap
    // the pool at tier 7 so the final stretch to Trifle still requires
    // genuine merging rather than being handed out for free.
    const maxDrop = Math.max(4, Math.min(7, highestTier - 2));
    // Weighted bias — small tiers stay the bread-and-butter of the ladle.
    const weights = [40, 28, 16, 9, 5, 3, 2, 1].slice(0, maxDrop + 1);
    let total = 0;
    for (const w of weights) total += w;
    let pick = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return i;
    }
    return 0;
  }

  function reset() {
    for (const b of [...items]) removeBody(b);
    particles.length = 0;
    score = 0;
    highestTier = -1;
    updateMenuHighlight();
    nextTier = randomNextTier();
    queuedTier = randomNextTier();
    drawNextPreview();
    ladleX = (PLAY_LEFT + PLAY_RIGHT) / 2;
    paused = false;
    gameOver = false;
    dangerStart = 0;
    started = true;
    comboMultiplier = 1;
    lastMergeAt = 0;
    flashText = null;
    gameOverPhase = null;
    hideOverlay();
    canvas.focus();
  }

  function showFlash(t) {
    flashText = t;
    flashUntil = performance.now() + 1300;
  }

  // ============================================================
  // CONTROLS
  // ============================================================
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.key.toLowerCase()] = true;

    if (!started) {
      if (e.key === ' ' || e.key === 'Enter') reset();
      return;
    }
    if (gameOver) {
      if (e.key.toLowerCase() === 'r' || e.key === 'Enter' || e.key === ' ') reset();
      return;
    }
    if (e.key.toLowerCase() === 'p') {
      paused = !paused;
      if (paused) showOverlay('Paused', 'Press P to keep eating', 'Resume');
      else hideOverlay();
    }
    if (e.key.toLowerCase() === 'r') reset();
    if (e.key.toLowerCase() === 'm') { muted = !muted; setMusicMuted(muted); }
    if ((e.key === ' ' || e.key === 'ArrowDown') && !paused) {
      drop();
      e.preventDefault();
    }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  function drop() {
    if (dropCooldown > 0) return;
    const r = FOODS[nextTier].radius;
    const x = clamp(ladleX, PLAY_LEFT + r + 4, PLAY_RIGHT - r - 4);
    const b = spawnAt(nextTier, x, LADLE_Y + r + 10);
    // Push it down a bit harder so it hits the bowl (or the pile) with some
    // gusto and does a livelier bounce on entry.
    Body.setVelocity(b, { x: (Math.random() - 0.5) * 0.6, y: 4 });
    nextTier = queuedTier;
    queuedTier = randomNextTier();
    drawNextPreview();
    dropCooldown = 0.32; // seconds — snappier with the smaller bowl
    playDrop();
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ----- Mouse: hover to aim, click to drop --------------------------------
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    ladleX = clamp(x, PLAY_LEFT + 30, PLAY_RIGHT - 30);
  });
  canvas.addEventListener('mousedown', () => {
    startMusic();
    if (started && !paused && !gameOver) drop();
  });

  // First user gesture anywhere on the page is enough to satisfy autoplay
  // policies and kick the music loop off — the listeners detach once they
  // fire so we don't keep retrying.
  ['pointerdown', 'keydown', 'touchstart'].forEach((evt) => {
    const handler = () => { startMusic(); window.removeEventListener(evt, handler); };
    window.addEventListener(evt, handler, { once: false });
  });

  // ----- Touch (iPad / phone): drag to aim, lift to drop -------------------
  // - touchstart  : begin a drag, snap ladle to the touch x
  // - touchmove   : slide the ladle with the finger (no scrolling)
  // - touchend    : release → drop the dish
  // The page is prevented from scrolling/zooming while a finger is on the
  // canvas (canvas has `touch-action: none`).
  let touchActive = false;
  function touchToCanvasX(t) {
    const rect = canvas.getBoundingClientRect();
    return (t.clientX - rect.left) * (W / rect.width);
  }
  canvas.addEventListener('touchstart', (e) => {
    if (!started || paused || gameOver) return; // let the overlay button handle taps
    if (!e.touches[0]) return;
    e.preventDefault();
    // Resume audio context — iOS requires a user gesture
    const a = ac(); if (a && a.state === 'suspended') a.resume();
    touchActive = true;
    ladleX = clamp(touchToCanvasX(e.touches[0]), PLAY_LEFT + 30, PLAY_RIGHT - 30);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!touchActive || !e.touches[0]) return;
    e.preventDefault();
    ladleX = clamp(touchToCanvasX(e.touches[0]), PLAY_LEFT + 30, PLAY_RIGHT - 30);
  }, { passive: false });
  const releaseTouch = (e) => {
    if (!touchActive) return;
    e?.preventDefault?.();
    touchActive = false;
    if (started && !paused && !gameOver) drop();
  };
  canvas.addEventListener('touchend', releaseTouch, { passive: false });
  canvas.addEventListener('touchcancel', () => { touchActive = false; });

  // ============================================================
  // UI: menu list, next preview, overlay
  // ============================================================
  function buildMenu() {
    const ol = document.getElementById('menu');
    ol.innerHTML = '';
    FOODS.forEach((f, i) => {
      if (f.special) return;          // power-ups don't sit in the climbing chain
      const li = document.createElement('li');
      li.textContent = f.name;
      li.dataset.tier = String(i);
      ol.appendChild(li);
    });
  }
  buildMenu();
  function updateMenuHighlight() {
    const ol = document.getElementById('menu');
    [...ol.children].forEach((li, i) => {
      li.classList.toggle('cur', i === highestTier);
    });
  }

  function drawNextPreview() {
    const c = document.getElementById('next');
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, c.width, c.height);
    const f = FOODS[nextTier];
    const sprite = foodSprites[nextTier];
    const target = 130;
    // scale sprite to fit
    const scale = Math.min(target / sprite.width, target / sprite.height);
    cx.save();
    cx.translate(c.width / 2, c.height / 2);
    cx.scale(scale, scale);
    cx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
    cx.restore();
    document.getElementById('next-name').textContent = f.name;
  }
  drawNextPreview();

  function showOverlay(title, body, btn = 'Resume', opts = {}) {
    const { showPhoto = false, showScoreBox = false, showBoard = false, highlightEntry = null } = opts;
    const ov = document.getElementById('overlay');
    document.getElementById('ovTitle').textContent = title;
    document.getElementById('ovBody').innerHTML = body;
    const button = document.getElementById('ovBtn');
    button.textContent = btn;
    document.getElementById('ovPhotoBtn').classList.toggle('hidden', !showPhoto);
    const scoreBox = document.getElementById('ovScoreBox');
    scoreBox.classList.toggle('hidden', !showScoreBox);
    if (showScoreBox) {
      document.getElementById('ovFinalScore').textContent = String(Math.floor(score));
      const nameInput = document.getElementById('ovName');
      nameInput.value = lastUsedName();
      // Briefly defer focus so on-screen keyboards on iPad pop up cleanly
      setTimeout(() => nameInput.focus(), 80);
    }
    if (showBoard) renderOverlayBoard(highlightEntry);
    else document.getElementById('ovBoard').classList.add('hidden');
    ov.classList.remove('hidden');
  }
  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }

  // Game-over has two phases: enter-name, then leaderboard view.
  let gameOverPhase = null;        // null | 'enter-name' | 'board'
  let lastEntry = null;

  document.getElementById('ovBtn').addEventListener('click', () => {
    playClick();
    startMusic();
    if (gameOverPhase === 'enter-name') {
      // Save the score, then show the leaderboard view
      const nameInput = document.getElementById('ovName');
      lastEntry = recordScore(nameInput.value, score);
      gameOverPhase = 'board';
      const placement = leaderboard.indexOf(lastEntry) + 1;
      const placeText = placement > 0
        ? `You finished <b>#${placement}</b> on the Honours Board!`
        : 'A noble effort.';
      showOverlay(
        'The Honours Board',
        `${placeText}<br/><br/>Final score: <b>${lastEntry.score.toLocaleString()}</b>`,
        'Serve again',
        { showPhoto: true, showBoard: true, highlightEntry: lastEntry },
      );
      return;
    }
    if (!started || gameOver) reset();
    else { paused = false; hideOverlay(); canvas.focus(); }
  });
  document.getElementById('ovPhotoBtn').addEventListener('click', () => { playClick(); exportPhoto(); });
  // Pressing Enter in the name field acts like clicking the button
  document.getElementById('ovName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('ovBtn').click();
    }
  });

  // ---- Photo export — render the bowl + a hand-drawn caption to PNG -------
  function exportPhoto() {
    const out = document.createElement('canvas');
    const cap = 120;
    out.width = W; out.height = H + cap;
    const oc = out.getContext('2d');
    // a soft parchment matte around the canvas
    oc.fillStyle = '#f3e7c9';
    oc.fillRect(0, 0, out.width, out.height);
    oc.drawImage(canvas, 0, 0);
    // caption strip
    oc.fillStyle = '#7a1f2b';
    oc.fillRect(0, H, W, cap);
    // gold trim
    oc.fillStyle = '#c8a44a';
    oc.fillRect(0, H, W, 4);
    oc.fillRect(0, H + cap - 4, W, 4);
    // text
    oc.fillStyle = '#c8a44a';
    oc.textAlign = 'center'; oc.textBaseline = 'middle';
    oc.font = "bold 44px 'Caveat', cursive";
    oc.fillText('The Haileybury Dining Hall', W / 2, H + 38);
    oc.font = "bold 32px 'Caveat', cursive";
    oc.fillText(`Score: ${Math.floor(score)} — ${new Date().toLocaleDateString()}`, W / 2, H + 84);

    // download
    const url = out.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `haileybury-dinner-${Math.floor(score)}.png`;
    document.body.appendChild(link); link.click(); link.remove();
  }

  // ============================================================
  // GAME OVER detection
  // ============================================================
  function checkGameOver(dt) {
    let overLine = false;
    for (const b of items) {
      const top = b.position.y - FOODS[b.tier].radius;
      const v = Math.hypot(b.velocity.x, b.velocity.y);
      const age = (performance.now() - b.spawnedAt) / 1000;
      // give freshly-dropped pieces a grace period
      if (top < DANGER_Y && v < 0.6 && age > 1.5) { overLine = true; break; }
    }
    if (overLine) {
      if (dangerStart === 0) dangerStart = performance.now();
      else if (performance.now() - dangerStart > 1500) {
        gameOver = true;
        if (score > best) {
          best = score;
          localStorage.setItem('haileybury-dining-best', String(best));
        }
        playGameOver();
        gameOverPhase = 'enter-name';
        const isBest = score >= (leaderboard[0]?.score || 0) && score > 0;
        const beatPersonal = score > best;
        const head = isBest ? 'A new High Score!' : (beatPersonal ? 'A personal best!' : 'The bowl runneth over!');
        showOverlay(
          head,
          `Add your name to the <b>Honours Board</b> to record your score.`,
          'Submit score',
          { showScoreBox: true },
        );
      }
    } else {
      dangerStart = 0;
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  function drawLadle() {
    const f = FOODS[nextTier];
    const x = clamp(ladleX, PLAY_LEFT + f.radius + 4, PLAY_RIGHT - f.radius - 4);

    // ladle handle
    ctx.save();
    ctx.strokeStyle = '#3a1e0c'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, 30); ctx.lineTo(x, LADLE_Y - 10);
    ctx.stroke();
    ctx.strokeStyle = '#c8a44a'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 1, 32); ctx.lineTo(x - 1, LADLE_Y - 12);
    ctx.stroke();

    // ladle bowl
    ctx.fillStyle = '#d9d6cd'; inkOutline(ctx, 2.6);
    ctx.beginPath();
    ctx.ellipse(x, LADLE_Y, 36, 14, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // food sitting in / under ladle
    const sprite = foodSprites[nextTier];
    ctx.drawImage(sprite, x - sprite.width / 2, LADLE_Y + f.radius * 0.1 - sprite.height / 2);

    // guide line down to the bowl
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(122,31,43,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, LADLE_Y + f.radius + 12);
    ctx.lineTo(x, PLAY_BOTTOM - 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawDangerLine() {
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
    ctx.strokeStyle = `rgba(122,31,43,${0.25 + pulse * 0.35})`;
    ctx.lineWidth = 2.4;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(PLAY_LEFT - 2, DANGER_Y);
    ctx.lineTo(PLAY_RIGHT + 2, DANGER_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    // little sign
    ctx.fillStyle = '#7a1f2b';
    ctx.font = "bold 14px 'Caveat', cursive";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('don’t pile above the rim!', PLAY_LEFT + 4, DANGER_Y - 10);
    ctx.restore();
  }

  function drawFoods() {
    for (const b of items) {
      const sprite = foodSprites[b.tier];
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      // squash on collision: stretch wider, squish shorter, decays each frame
      if (b.squash > 0.01) {
        const sx = 1 + b.squash * 0.18;
        const sy = 1 - b.squash * 0.18;
        ctx.scale(sx, sy);
        b.squash *= 0.82;
      } else {
        b.squash = 0;
      }
      // golden apples shimmer slightly
      if (b.tier === APPLE_TIER) {
        const pulse = 1 + Math.sin(performance.now() / 160) * 0.04;
        ctx.scale(pulse, pulse);
      }
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    }
  }

  // ---- Animated chandelier (replaces the static one in the bg) -----------
  function drawChandelier() {
    const baseX = W / 2;
    const baseY = 130;
    // pendulum hangs from the dome peak; a is the swing angle in radians
    const a = chandelier.angle;
    const len = 80;
    // bottom of chain at baseY + len, offset by sin(a)*len
    const cx = baseX + Math.sin(a) * len * 0.6;   // dampen x sway
    const cy = baseY + Math.cos(a) * len * 0.05;  // tiny y wobble
    // chain
    ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(baseX, 0); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a * 0.8);
    // dome (brass)
    ctx.fillStyle = '#5b3416'; inkOutline(ctx, 2.4);
    ctx.beginPath();
    ctx.moveTo(-60, 15);
    ctx.bezierCurveTo(-75, 35, 75, 35, 60, 15);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // ring of bulbs
    ctx.fillStyle = '#3a1e0c';
    ctx.beginPath(); ctx.ellipse(0, 45, 70, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    for (let i = -3; i <= 3; i++) {
      const x = i * 20, y = 57;
      ctx.fillStyle = 'rgba(255,230,120,.35)';
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff5b8';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3a1e0c'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // central pendant
    ctx.fillStyle = '#c8a44a';
    ctx.beginPath(); ctx.arc(0, 70, 6, 0, Math.PI * 2); ctx.fill();
    inkOutline(ctx, 1.5); ctx.stroke();
    ctx.restore();
  }

  // ---- Portrait eyes follow the ladle ------------------------------------
  function drawPortraitEyes() {
    // gaze target is the ladle's current position (or bowl centre when idle)
    const tx = (started && !gameOver) ? ladleX : (PLAY_LEFT + PLAY_RIGHT) / 2;
    const ty = (started && !gameOver) ? LADLE_Y : (PLAY_TOP + PLAY_BOTTOM) / 2;
    for (const e of portraitEyes) {
      // left eye
      const ldx = tx - e.ex, ldy = ty - e.ey;
      const ld = Math.max(1, Math.hypot(ldx, ldy));
      const lex = e.ex + (ldx / ld) * e.maxShift;
      const ley = e.ey + (ldy / ld) * e.maxShift;
      // right eye
      const rdx = tx - e.lx, rdy = ty - e.ly;
      const rd = Math.max(1, Math.hypot(rdx, rdy));
      const rex = e.lx + (rdx / rd) * e.maxShift;
      const rey = e.ly + (rdy / rd) * e.maxShift;
      // glasses-wearers get visible eye-whites behind the lens; bare-eyed
      // portraits just get dark pupils on the skin so the variety reads.
      const showSclera = e.mrWade || e.glasses;
      if (showSclera) {
        ctx.fillStyle = '#fbf2d4';
        ctx.beginPath(); ctx.arc(e.ex, e.ey, 2.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(e.lx, e.ly, 2.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#1a1108';
      const pupilR = showSclera ? 1.8 : 1.6;
      ctx.beginPath(); ctx.arc(lex, ley, pupilR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(rex, rey, pupilR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawHUD() {
    document.getElementById('score').textContent = String(Math.floor(score));
    document.getElementById('best').textContent = String(Math.max(best, Math.floor(score)));

    if (flashText && performance.now() < flashUntil) {
      ctx.save();
      const alpha = Math.min(1, (flashUntil - performance.now()) / 600);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#c8a44a';
      ctx.strokeStyle = '#2a1a0e';
      ctx.lineWidth = 4;
      ctx.font = "bold 56px 'Caveat', cursive";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText(flashText, W / 2, 480);
      ctx.fillText(flashText, W / 2, 480);
      ctx.restore();
    }
  }

  // ============================================================
  // MAIN LOOP
  // ============================================================
  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(1 / 30, (t - lastT) / 1000);
    lastT = t;

    if (started && !paused && !gameOver) {
      // ladle movement
      const speed = 600;
      let target = ladleX;
      if (keys['arrowleft'] || keys['a']) target -= speed * dt;
      if (keys['arrowright'] || keys['d']) target += speed * dt;
      ladleX = clamp(target, PLAY_LEFT + 30, PLAY_RIGHT - 30);

      dropCooldown = Math.max(0, dropCooldown - dt);

      Engine.update(engine, dt * 1000);
      clampInsideBowl();
      updateParticles(dt);
      checkGameOver(dt);
      // combo timeout
      if (comboMultiplier > 1 && performance.now() - lastMergeAt > COMBO_WINDOW) {
        comboMultiplier = 1;
      }
      maybeSpawnPigeon();
      updatePigeon(dt);
    } else {
      // still let particles drift on pause/game-over for a touch of life
      updateParticles(dt);
    }
    // chandelier + shake always animate (even when paused — feels alive)
    updateChandelier(dt);
    updateShake();

    // ----- render -----
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shakeMag > 0) ctx.translate(shakeX, shakeY);
    ctx.drawImage(bg, 0, 0);
    drawChandelier();
    drawPortraitEyes();
    drawDangerLine();
    drawFoods();
    drawPigeon();
    drawParticles();
    if (started && !gameOver) drawLadle();
    drawHUD();
    ctx.restore();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // intro overlay — adapts to touch vs keyboard
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const controlsHint = isTouch
    ? '<b>Drag</b> across the bowl to aim, then <b>lift your finger</b> to drop the dish.'
    : 'Use <b>← / →</b> (or <b>A / D</b>) to slide the ladle, then <b>Space</b> or <b>↓</b> to drop.';
  showOverlay(
    'The Haileybury Dining Hall',
    `Drop the food into the bowl. Match two of the same to grow it into the next dish.<br/>Climb the menu — peas, beans, croutons, battered fish, sausages, Yorkshires, jackets, roasts, sticky toffee, flaming Christmas pud, and finally <b>The Haileybury Trifle</b>.<br/><br/>${controlsHint}<br/><br/><i>Sursum Corda — lift up your plates!</i>`,
    'Start Dinner',
    { showBoard: leaderboard.length > 0 },
  );
})();
