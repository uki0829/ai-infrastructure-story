<script lang="ts">
  // STEPS = 20 → each click = 5% (was 10 = 10% per click)
  const STEPS    = 20;
  const BODY_TOP = 16;
  const BODY_H   = 86;

  // Warn threshold: 80% = 16 out of 20 clicks
  const WARN_AT  = 16;

  let clicks    = $state(0);
  let exploded  = $state(false);
  let boomMsg   = $state('');
  let fillOpacity = $state(1);
  let terminalTransform = $state('');
  let particles = $state<{ id: number; x: number; y: number; tx: number; ty: number; r: number; col: string; opacity: number }[]>([]);

  let pulseId = 0;

  const fh   = $derived((clicks / STEPS) * BODY_H);
  const topY = $derived(BODY_TOP + BODY_H - fh);
  const pct  = $derived(Math.round((clicks / STEPS) * 100));

  // 20 colour stops — teal (0-30%) → green (35-45%) → amber (50-60%) → orange (65-75%) → red (80-100%)
  const CHARGE_COLORS = [
    '#4ec9c9', // 5%
    '#4ec9c9', // 10%
    '#4ec9c9', // 15%
    '#4ec9c9', // 20%
    '#4ec9c9', // 25%
    '#4ec9c9', // 30%
    '#6ecf6e', // 35%
    '#6ecf6e', // 40%
    '#a8d44d', // 45%
    '#f0c040', // 50%
    '#f0c040', // 55%
    '#efaa30', // 60%
    '#f09020', // 65%
    '#f09020', // 70%
    '#f06030', // 75%
    '#f04020', // 80%
    '#f03020', // 85%
    '#e82010', // 90%
    '#e01010', // 95%
    '#cc0000', // 100%
  ];
  const fillColor   = $derived(CHARGE_COLORS[Math.max(0, clicks - 1)] ?? '#4ec9c9');
  const boltVisible = $derived(clicks > 0);

  function startPulse() {
    cancelAnimationFrame(pulseId);
    const tick = () => {
      if (exploded || clicks < WARN_AT) { fillOpacity = 1; return; }
      fillOpacity = 0.72 + 0.28 * Math.sin(Date.now() / 120);
      pulseId = requestAnimationFrame(tick);
    };
    pulseId = requestAnimationFrame(tick);
  }

  function stopPulse() {
    cancelAnimationFrame(pulseId);
    fillOpacity = 1;
  }

  function spawnSparks() {
    const colors = ['#ff5f5f','#ffd166','#4ec9c9','#ffffff','#ff9b9b','#bdffff','#f0c040'];
    const cx = 26, cy = 16;
    const newParticles = Array.from({ length: 22 }, (_, i) => {
      const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 25 + Math.random() * 55;
      return {
        id: i,
        x: cx, y: cy,
        tx: cx + Math.cos(angle) * speed,
        ty: cy + Math.sin(angle) * speed,
        r: 2 + Math.random() * 4,
        col: colors[i % colors.length],
        opacity: 1
      };
    });
    particles = newParticles;

    newParticles.forEach((p, idx) => {
      const dur  = 500 + Math.random() * 500;
      const t0   = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - progress, 2);
        particles[idx] = {
          ...particles[idx],
          x: cx + (p.tx - cx) * ease,
          y: cy + (p.ty - cy) * ease,
          opacity: 1 - progress
        };
        particles = [...particles];
        if (progress < 1) requestAnimationFrame(step);
        else particles = particles.filter(pp => pp.id !== p.id);
      };
      requestAnimationFrame(step);
    });
  }

  function doExplode() {
    exploded = true;
    stopPulse();
    boomMsg = 'OVERLOADED';
    terminalTransform = 'translate(-6,-28) rotate(-35,26,7)';
    spawnSparks();

    setTimeout(() => {
      clicks = 0;
      exploded = false;
      boomMsg = '';
      terminalTransform = '';
      particles = [];
    }, 1900);
  }

  export function handleClick() {
    if (exploded) return;
    clicks = Math.min(clicks + 1, STEPS);
    if (clicks >= WARN_AT && clicks < STEPS) startPulse();
    else if (clicks < WARN_AT) stopPulse();
    if (clicks >= STEPS) doExplode();
  }
</script>

<div class="battery-widget">
  <svg width="52" height="108" viewBox="0 0 52 110" overflow="visible" style="overflow:visible;">
    <defs>
      <clipPath id="batt-clip">
        <rect x="4" y={BODY_TOP} width="44" height={BODY_H} rx="5"/>
      </clipPath>
    </defs>

    <rect
      x="17" y="2" width="18" height="10" rx="3"
      fill="none" stroke="rgba(180,220,255,0.5)" stroke-width="1.5"
      transform={terminalTransform}
      style="transition: transform 0.15s ease;"
    />

    <rect
      x="4" y={BODY_TOP} width="44" height={BODY_H} rx="6"
      fill="none" stroke="rgba(180,220,255,0.35)" stroke-width="1.5"
    />

    <line x1="4" y1="44" x2="48" y2="44" stroke="rgba(180,220,255,0.1)" stroke-width="1"/>
    <line x1="4" y1="66" x2="48" y2="66" stroke="rgba(180,220,255,0.1)" stroke-width="1"/>
    <line x1="4" y1="88" x2="48" y2="88" stroke="rgba(180,220,255,0.1)" stroke-width="1"/>

    <g clip-path="url(#batt-clip)">
      <rect
        x="4" y={topY} width="44" height={fh} rx="4"
        fill={fillColor}
        opacity={fillOpacity}
        style="transition: y 0.25s ease, height 0.25s ease, fill 0.4s ease;"
      />
    </g>

    <path
      d="M27 42 L22 55 H26 L25 68 L30 55 H26 L27 42Z"
      fill={boltVisible ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0)'}
      style="transition: fill 0.3s ease;"
    />

    {#each particles as p (p.id)}
      <circle cx={p.x} cy={p.y} r={p.r} fill={p.col} opacity={p.opacity}/>
    {/each}
  </svg>

  <span class="pct" class:warn={clicks >= WARN_AT && !exploded}>{pct}%</span>

  {#if boomMsg}
    <span class="boom">{boomMsg}</span>
  {/if}
</div>

<style>
  .battery-widget {
    position: fixed;
    bottom: 2rem;
    left: 2rem;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    pointer-events: none;
  }

  .pct {
    font-family: 'Corpta', monospace;
    font-size: 0.6rem;
    color: rgba(180, 220, 255, 0.6);
    letter-spacing: 1.5px;
    transition: color 0.3s;
  }

  .pct.warn {
    color: #ff8080;
    animation: blink 0.5s ease-in-out infinite alternate;
  }

  .boom {
    font-family: 'Corpta', monospace;
    font-size: 0.5rem;
    letter-spacing: 2px;
    color: #ff5f5f;
    animation: fadeup 1.9s ease forwards;
  }

  @keyframes blink {
    from { opacity: 0.55; }
    to   { opacity: 1; }
  }

  @keyframes fadeup {
    0%   { opacity: 1;  transform: translateY(0px); }
    100% { opacity: 0;  transform: translateY(-14px); }
  }
</style>