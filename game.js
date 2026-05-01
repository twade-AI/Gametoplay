/* ============================================================
 * The Haileybury Dining Hall — A Suika-style Feast
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

  // Play-field geometry (the bowl)
  const PLAY_LEFT   = 150;
  const PLAY_RIGHT  = 750;
  const PLAY_TOP    = 230;
  const PLAY_BOTTOM = 940;
  const DANGER_Y    = 285;
  const LADLE_Y     = 195;

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
  function inkOutline(ctx, w = 2.6) {
    ctx.strokeStyle = '#2a1a0e';
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  function wobblyCircle(ctx, x, y, r, seed, fill = true, stroke = true) {
    const rng = mulberry(seed);
    ctx.beginPath();
    const steps = 36 + Math.floor(r / 3);
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const j = (rng() - 0.5) * Math.max(0.8, r * 0.045);
      const px = x + Math.cos(a) * (r + j);
      const py = y + Math.sin(a) * (r + j);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
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

  function shadowBlob(ctx, r) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(2, r * 0.92, r * 0.95, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // FOODS — 11 tiers, smallest to largest
  // (radii hand-tuned so each tier is visibly bigger than the last)
  // ============================================================
  const FOODS = [
    { // 0
      name: 'Garden Pea',
      radius: 18, color: '#7fb83a',
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx, 2.2);
        wobblyCircle(ctx, 0, 0, r, seed);
        ctx.fillStyle = '#bcdd7e';
        ctx.beginPath();
        ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.35, r * 0.16, -0.5, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    { // 1
      name: 'Baked Bean',
      radius: 24, color: '#d2632b',
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        ctx.beginPath();
        ctx.moveTo(-r * 0.95, 0);
        ctx.bezierCurveTo(-r * 0.95, -r * 1.1, r * 0.95, -r * 1.1, r * 0.95, 0);
        ctx.bezierCurveTo(r * 0.95, r * 0.95, r * 0.4, r * 0.45, 0, r * 0.55);
        ctx.bezierCurveTo(-r * 0.4, r * 0.45, -r * 0.95, r * 0.95, -r * 0.95, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f0a268';
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.45, r * 0.35, r * 0.11, -0.3, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    { // 2
      name: 'Crusty Crouton',
      radius: 32, color: '#e7b864',
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        const rng = mulberry(seed); const s = r * 0.95;
        const pts = [
          [-s + rng() * 5, -s + rng() * 5],
          [ s - rng() * 5, -s + rng() * 5],
          [ s - rng() * 5,  s - rng() * 5],
          [-s + rng() * 5,  s - rng() * 5],
        ];
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // crumb texture
        speckle(ctx, 0, 0, r, seed + 7, 18, '#8a5a1c');
        ctx.fillStyle = '#f3d491';
        for (let i = 0; i < 4; i++) {
          const a = rng() * Math.PI * 2; const d = rng() * r * 0.5;
          ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2, 0, Math.PI * 2); ctx.fill();
        }
      },
    },
    { // 3
      name: 'Fish Finger',
      radius: 42, color: '#d8a44b',
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        const w = r * 1.2, h = r * 0.78;
        ctx.beginPath();
        ctx.moveTo(-w, -h);
        ctx.quadraticCurveTo(-w - h * 0.5, 0, -w, h);
        ctx.lineTo(w, h);
        ctx.quadraticCurveTo(w + h * 0.5, 0, w, -h);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // breadcrumb dots
        const rng = mulberry(seed);
        ctx.fillStyle = '#5a3413';
        for (let i = 0; i < 22; i++) {
          ctx.beginPath();
          ctx.arc(-w + rng() * w * 2, -h + rng() * h * 2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f3d491';
        ctx.beginPath();
        ctx.ellipse(-w * 0.3, -h * 0.55, w * 0.5, h * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    { // 4
      name: 'Cocktail Sausage',
      radius: 54, color: '#c97e64',
      draw(ctx, r, seed) {
        ctx.fillStyle = this.color; inkOutline(ctx);
        const w = r * 1.15, h = r * 0.62;
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.bezierCurveTo(-w, -h * 1.7, w, -h * 1.7, w, 0);
        ctx.bezierCurveTo(w, h * 1.7, -w, h * 1.7, -w, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // wrinkles
        ctx.lineWidth = 1.6; ctx.strokeStyle = '#5a2a1b';
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * r * 0.32, -h * 0.55);
          ctx.quadraticCurveTo(i * r * 0.32 + 3, 0, i * r * 0.32, h * 0.55);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,220,200,.55)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.35, -h * 0.85, r * 0.55, h * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      },
    },
    { // 5
      name: 'Yorkshire Pudding',
      radius: 68, color: '#dba85d',
      draw(ctx, r, seed) {
        // outer rim
        ctx.fillStyle = '#c0823f'; inkOutline(ctx);
        wobblyCircle(ctx, 0, r * 0.05, r * 0.96, seed);
        // inner crater
        ctx.fillStyle = this.color;
        wobblyCircle(ctx, 0, -r * 0.03, r * 0.7, seed + 9);
        // gravy pool
        ctx.fillStyle = '#5b3416';
        wobblyCircle(ctx, 0, 0, r * 0.42, seed + 21, true, false);
        // gravy gloss
        ctx.fillStyle = '#7a4a1f';
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
      radius: 84, color: '#a26a32',
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
      radius: 104, color: '#d6a25b',
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
      radius: 124, color: '#5a2f15',
      draw(ctx, r, seed) {
        // base
        ctx.fillStyle = this.color; inkOutline(ctx);
        wobblyCircle(ctx, 0, r * 0.12, r * 0.84, seed);
        // top dome
        ctx.fillStyle = '#7a4422';
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.08, r * 0.78, r * 0.45, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // toffee drizzle
        ctx.fillStyle = '#c98637';
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
      radius: 148, color: '#3a1e0c',
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
      radius: 175, color: '#fff7e0',
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
  ];

  // ----- Pre-render food sprites to offscreen canvases ---------------------
  const foodSprites = FOODS.map((food, i) => {
    const pad = 28;
    // generous bounds: christmas pud has flames above, chicken has legs below
    const sz = Math.ceil(food.radius * 3.2 + pad * 2);
    const c = document.createElement('canvas');
    c.width = sz; c.height = sz;
    const cx = c.getContext('2d');
    cx.translate(sz / 2, sz / 2);
    shadowBlob(cx, food.radius);
    food.draw(cx, food.radius, 9171 + i * 137);
    return c;
  });

  // ============================================================
  // BACKGROUND — the dining hall (drawn once, blitted each frame)
  // ============================================================
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  paintHall(bg.getContext('2d'));

  function paintHall(c) {
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

    // CENTRAL CHANDELIER (large, hanging on chain)
    c.strokeStyle = '#2a1a0e'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, 130); c.stroke();
    // chandelier dome (brass)
    c.fillStyle = '#5b3416'; inkOutline(c, 2.4);
    c.beginPath();
    c.moveTo(W / 2 - 60, 145);
    c.bezierCurveTo(W / 2 - 75, 165, W / 2 + 75, 165, W / 2 + 60, 145);
    c.closePath(); c.fill(); c.stroke();
    // chandelier ring of bulbs
    c.fillStyle = '#3a1e0c';
    c.beginPath(); c.ellipse(W / 2, 175, 70, 12, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    for (let i = -3; i <= 3; i++) {
      const x = W / 2 + i * 20; const y = 187;
      c.fillStyle = '#fff5b8';
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#3a1e0c'; c.lineWidth = 1.2; c.stroke();
      // glow
      c.fillStyle = 'rgba(255,230,120,.4)';
      c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();
    }
    // central pendant
    c.fillStyle = '#c8a44a';
    c.beginPath(); c.arc(W / 2, 200, 6, 0, Math.PI * 2); c.fill();
    inkOutline(c, 1.5); c.stroke();

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
    for (let i = 0; i < 3; i++) {
      const sy = 320 + i * 220;
      sconce(72, sy);
      sconce(W - 72, sy);
    }

    // ============================
    // HEADMASTER PORTRAITS in gilded frames (between sconces)
    // ============================
    const portraits = [
      [16, 392], [16, 612], [16, 832],
      [W - 124, 392], [W - 124, 612], [W - 124, 832],
    ];
    const portraitNames = ['F.M. 1862', 'A.G.B. 1875', 'C.A.E. 1899', 'L.M. 1923', 'D.S. 1956', 'M.W. 1988'];
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
      // face
      c.fillStyle = '#d8b58c';
      c.beginPath(); c.arc(px + 54, py + 60, 20, 0, Math.PI * 2); c.fill();
      // hair / wig
      c.fillStyle = '#1a1108';
      c.beginPath();
      c.ellipse(px + 54, py + 46, 22, 12, 0, Math.PI, 0);
      c.fill();
      // gown
      c.fillStyle = '#1a1108';
      c.beginPath();
      c.moveTo(px + 22, py + 138); c.lineTo(px + 32, py + 80);
      c.lineTo(px + 76, py + 80); c.lineTo(px + 86, py + 138);
      c.closePath(); c.fill();
      // collar / stock
      c.fillStyle = '#fff';
      c.beginPath();
      c.moveTo(px + 44, py + 78); c.lineTo(px + 64, py + 78);
      c.lineTo(px + 60, py + 92); c.lineTo(px + 48, py + 92);
      c.closePath(); c.fill();
      // expression: small mouth
      c.strokeStyle = '#2a1a0e'; c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(px + 47, py + 70); c.quadraticCurveTo(px + 54, py + 71, px + 61, py + 70);
      c.stroke();
      // eyes
      c.fillStyle = '#1a1108';
      c.beginPath(); c.arc(px + 47, py + 58, 1.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(px + 61, py + 58, 1.6, 0, Math.PI * 2); c.fill();
      // outer frame outline
      inkOutline(c, 2); c.strokeRect(px, py, 108, 150);
      // brass nameplate
      c.fillStyle = '#c8a44a';
      c.fillRect(px + 18, py + 152, 72, 13);
      c.strokeRect(px + 18, py + 152, 72, 13);
      c.fillStyle = '#2a1a0e';
      c.font = "bold 9px 'Special Elite', monospace";
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(portraitNames[idx], px + 54, py + 159);
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
  engine.world.gravity.y = 1.0;
  const world = engine.world;

  const wallOpts = { isStatic: true, restitution: 0.05, friction: 0.5 };
  const ground = Bodies.rectangle((PLAY_LEFT + PLAY_RIGHT) / 2, PLAY_BOTTOM + 28, PLAY_RIGHT - PLAY_LEFT + 60, 56, wallOpts);
  const leftW = Bodies.rectangle(PLAY_LEFT - 14, (PLAY_TOP + PLAY_BOTTOM) / 2, 28, PLAY_BOTTOM - PLAY_TOP + 240, wallOpts);
  const rightW = Bodies.rectangle(PLAY_RIGHT + 14, (PLAY_TOP + PLAY_BOTTOM) / 2, 28, PLAY_BOTTOM - PLAY_TOP + 240, wallOpts);
  World.add(world, [ground, leftW, rightW]);

  const items = new Set();
  const merging = new Set();

  function spawnAt(tier, x, y, opts = {}) {
    const f = FOODS[tier];
    const body = Bodies.circle(x, y, f.radius, {
      restitution: 0.16,
      friction: 0.4,
      frictionAir: 0.0008,
      density: 0.0011 + tier * 0.00018,
      label: 'food',
      ...opts,
    });
    body.tier = tier;
    body.spawnedAt = performance.now();
    items.add(body);
    World.add(world, body);
    return body;
  }

  function removeBody(b) {
    items.delete(b);
    merging.delete(b.id);
    World.remove(world, b);
  }

  Events.on(engine, 'collisionStart', (e) => {
    for (const pair of e.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      if (a.label !== 'food' || b.label !== 'food') continue;
      if (a.tier !== b.tier) continue;
      if (merging.has(a.id) || merging.has(b.id)) continue;

      merging.add(a.id); merging.add(b.id);
      const cx = (a.position.x + b.position.x) / 2;
      const cy = (a.position.y + b.position.y) / 2;

      if (a.tier >= FOODS.length - 1) {
        // Two trifles! ascend to glory
        score += 1000;
        burstParticles(cx, cy, '#c8a44a', 36, 6);
        burstParticles(cx, cy, '#7a1f2b', 24, 5);
        playFanfare();
        showFlash('A double Trifle! +1000');
        removeBody(a); removeBody(b);
        continue;
      }
      const next = a.tier + 1;
      score += (next + 1) * (next + 2) / 2 * 5;
      if (next > highestTier) { highestTier = next; updateMenuHighlight(); }
      removeBody(a); removeBody(b);
      const nb = spawnAt(next, cx, cy);
      Body.setVelocity(nb, { x: 0, y: -1.5 });
      burstParticles(cx, cy, FOODS[next].color, 14, 3.5);
      playMerge(next);
      if (MERGE_QUIPS[next]) showFlash(MERGE_QUIPS[next]);
    }
  });

  // ============================================================
  // PARTICLES
  // ============================================================
  const particles = [];
  function burstParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
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
  function tone(freq, dur = 0.12, type = 'sine', vol = 0.18) {
    if (muted) return;
    const a = ac(); if (!a) return;
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
    const base = 280 + tier * 50;
    tone(base, 0.09, 'triangle', 0.18);
    setTimeout(() => tone(base * 1.5, 0.12, 'sine', 0.15), 60);
  }
  function playFanfare() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => tone(f, 0.18, 'triangle', 0.22), i * 110));
  }
  function playGameOver() {
    [440, 392, 349, 294].forEach((f, i) =>
      setTimeout(() => tone(f, 0.25, 'sawtooth', 0.18), i * 160));
  }

  // ============================================================
  // STATE
  // ============================================================
  const MERGE_QUIPS = {
    2: 'A crouton! Crunchy.',
    3: 'A fish finger appears!',
    5: 'A perfect Yorkshire — mind the gravy!',
    6: 'Behold, the jacket potato!',
    7: 'Sunday roast is served!',
    8: 'Sticky toffee — extra cream?',
    9: 'CHRISTMAS HAS COME EARLY!',
    10: 'THE HAILEYBURY TRIFLE!!',
  };
  let score = 0;
  let highestTier = -1;
  let best = Number(localStorage.getItem('haileybury-suika-best') || 0);
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
    // bias toward smaller tiers, classic Suika
    const r = Math.random();
    if (r < 0.45) return 0;
    if (r < 0.78) return 1;
    if (r < 0.93) return 2;
    if (r < 0.99) return 3;
    return 4;
  }

  function reset() {
    for (const b of [...items]) removeBody(b);
    particles.length = 0;
    score = 0;
    highestTier = -1;
    updateMenuHighlight();
    nextTier = randomNextTier();
    queuedTier = randomNextTier();
    ladleX = (PLAY_LEFT + PLAY_RIGHT) / 2;
    paused = false;
    gameOver = false;
    dangerStart = 0;
    started = true;
    flashText = null;
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
    if (e.key.toLowerCase() === 'm') muted = !muted;
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
    Body.setVelocity(b, { x: 0, y: 2 });
    nextTier = queuedTier;
    queuedTier = randomNextTier();
    drawNextPreview();
    dropCooldown = 0.42; // seconds
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
    if (started && !paused && !gameOver) drop();
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

  function showOverlay(title, body, btn = 'Resume') {
    const ov = document.getElementById('overlay');
    document.getElementById('ovTitle').textContent = title;
    document.getElementById('ovBody').innerHTML = body;
    const button = document.getElementById('ovBtn');
    button.textContent = btn;
    ov.classList.remove('hidden');
  }
  function hideOverlay() {
    document.getElementById('overlay').classList.add('hidden');
  }
  document.getElementById('ovBtn').addEventListener('click', () => {
    if (!started || gameOver) reset();
    else { paused = false; hideOverlay(); canvas.focus(); }
  });

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
          localStorage.setItem('haileybury-suika-best', String(best));
        }
        playGameOver();
        showOverlay(
          'The bowl runneth over!',
          `You scored <b>${score}</b> points.<br/>Best: <b>${best}</b>.<br/><br/>Press <b>R</b>, <b>Enter</b>, or the button to start a new dinner.`,
          'Serve again'
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
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
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
      updateParticles(dt);
      checkGameOver(dt);
    } else {
      // still let particles drift on pause/game-over for a touch of life
      updateParticles(dt);
    }

    // ----- render -----
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    drawDangerLine();
    drawFoods();
    drawParticles();
    if (started && !gameOver) drawLadle();
    drawHUD();

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
    `Drop the food into the bowl. Match two of the same to grow it into the next dish.<br/>Climb the menu — peas, beans, croutons, fish fingers, sausages, Yorkshires, jackets, roasts, sticky toffee, flaming Christmas pud, and finally <b>The Haileybury Trifle</b>.<br/><br/>${controlsHint}<br/><br/><i>Sursum Corda — lift up your plates!</i>`,
    'Start Dinner'
  );
})();
