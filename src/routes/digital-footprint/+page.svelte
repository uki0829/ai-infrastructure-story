<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount, tick } from 'svelte';

  let visible   = $state(false);
  let scrollY   = $state(0);
  let winHeight = $state(0);

  let cardRefs: (HTMLElement | null)[] = [null, null, null, null];
  let centers:  { x: number; y: number }[] = $state([]);
  let docHeight = $state(0);

  function measure() {
    docHeight = document.documentElement.scrollHeight;
    winHeight = window.innerHeight;
    centers = cardRefs.map((el) => {
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2,
        y: r.top + window.scrollY + r.height / 2,
      };
    });
  }

  onMount(() => {
    (async () => {
      visible = true;
      await tick();
      requestAnimationFrame(() => requestAnimationFrame(measure));
      // Animate card-1 loading bar from 0 → 100% over 2.4 s on page entry
      const duration = 2400;
      const t0 = performance.now();
      function stepCard1(now: number) {
        card1Prog = Math.min((now - t0) / duration, 1);
        if (card1Prog < 1) requestAnimationFrame(stepCard1);
      }
      requestAnimationFrame(stepCard1);
    })();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  const nodes = [
    { id: 1, label: 'Personal Computing', side: 'left'  },
    { id: 2, label: 'Hyperscale Datacenter', side: 'right' },
    { id: 3, label: 'Data Processing', side: 'left'  },
    { id: 4, label: 'Environmental Impacts', side: 'right' },
  ];

  const cardInfo = [
    {
      title: 'QUERY DISPATCHED',
      body: 'The sequence diagram begins with a user submitting a query from their device, which initiates the data upload process. These data is being transferred over the internet, traversing throught the network before reaching its destination.',
    },
    {
      title: 'INFRASTRUCTURE ENGAGED',
      body: 'The next step is where the datacenter as the recipient of the query. The datacenter is a facility that houses a large number of servers and networking equipment, which are responsible for processing and storing data. When the query reaches the datacenter, it engages the infrastructure to handle the incoming data and prepare it for processing.',
    },
    {
      title: 'COMPUTE AT SCALE',
      body: 'The datacenter processes the query using a vast array of specialized hardware, including GPUs and TPUs, to perform the necessary computations at scale.',
    },
    {
      title: 'HIDDEN COST',
      body: 'Once the information is being processed and decoded, it will be sent back to you as a response. However, the energy consumption and carbon emissions associated with processing and transmitting data can have significant environmental impacts, contributing to climate change and other ecological issues.',
    },
  ];

  function getActive(i: number): boolean {
    if (i === 0) return card1Active;
    if (i === 1) return card2Active;
    if (i === 2) return card3Active;
    return card4Active;
  }

  // Per-line color pairs (warm→cool→warm cycling)
  const lineColors = [
    { from: '#ffd580', to: '#bdffff' }, // amber  → cyan
    { from: '#bdffff', to: '#ff9b9b' }, // cyan   → coral
    { from: '#ff9b9b', to: '#ffd580' }, // coral  → amber
  ];

  // ── Snake ribbon geometry ─────────────────────────────────────────────
  // Control-point overshoot (±1.5×dx) creates a pronounced S-curve / snake.
  // The ribbon is made of two parallel bezier edges at ±hw from center,
  // so the entire path stays within [y1, y2] — safe for top-to-bottom clip.
  function ribbonPath(
    x1: number, y1: number,
    x2: number, y2: number,
    hw: number
  ): string {
    const dx   = x2 - x1;
    const cp1x = x1 + dx * 1.5;   // overshoot toward destination
    const cp2x = x1 - dx * 0.5;   // undershoot from destination
    return [
      `M ${x1} ${y1 - hw}`,
      `C ${cp1x} ${y1 - hw}  ${cp2x} ${y2 - hw}  ${x2} ${y2 - hw}`,
      `L ${x2} ${y2 + hw}`,
      `C ${cp2x} ${y2 + hw}  ${cp1x} ${y1 + hw}  ${x1} ${y1 + hw}`,
      'Z',
    ].join(' ');
  }

  // Top / bottom edge paths for crisp highlight strokes
  function edgePath(
    x1: number, y1: number,
    x2: number, y2: number,
    yOff: number
  ): string {
    const dx   = x2 - x1;
    const cp1x = x1 + dx * 1.5;
    const cp2x = x1 - dx * 0.5;
    return `M ${x1} ${y1 + yOff} C ${cp1x} ${y1 + yOff}  ${cp2x} ${y2 + yOff}  ${x2} ${y2 + yOff}`;
  }

  // ── Scroll-driven progress [0..1] for ribbon i ────────────────────────
  function lineProg(i: number): number {
    if (centers.length < 4 || winHeight === 0) return 0;
    const a = centers[i], b = centers[i + 1];
    const start = a.y - winHeight * 0.8;
    const end   = b.y - winHeight * 0.55;
    if (scrollY <= start) return 0;
    if (scrollY >= end)   return 1;
    return (scrollY - start) / (end - start);
  }

  // Card-1 progress animates 0→1 on page entry (not scroll-driven)
  let card1Prog    = $state(0);
  let card1Active  = $derived(card1Prog >= 0.88);
  let card1KbCount = $derived(Math.floor(card1Prog * 4096));

  // Card-2 progress: scroll-driven by the ribbon arriving from card 1
  let card2Prog    = $derived(lineProg(0));
  let card2Active  = $derived(card2Prog >= 0.88);
  let card2KbCount = $derived(Math.floor(card2Prog * 65536));

  // Card-3 progress: scroll-driven by the ribbon arriving from card 2
  let card3Prog    = $derived(lineProg(1));
  let card3Active  = $derived(card3Prog >= 0.88);
  let card3KbCount = $derived(Math.floor(card3Prog * 32768));

  // Reactive progress for the last line (node 3 → node 4)
  // Drives the card-4 digital "power-on" animation
  let card4Prog     = $derived(lineProg(2));
  let card4Active   = $derived(card4Prog >= 0.88);  // threshold to trigger reveal
  let card4KbCount  = $derived(Math.floor(card4Prog * 12847));

  // Responsive ribbon widths — thicker on mobile so the S-curve is visible
  let winWidth = $state(0);
  let hw1 = $derived(winWidth > 0 && winWidth < 640 ? 70 : 55);  // halo
  let hw2 = $derived(winWidth > 0 && winWidth < 640 ? 42 : 30);  // mid glow
  let hw3 = $derived(winWidth > 0 && winWidth < 640 ? 26 : 18);  // main body
  let hw4 = $derived(winWidth > 0 && winWidth < 640 ?  9 :  6);  // inner core
  let he  = $derived(winWidth > 0 && winWidth < 640 ? 26 : 18);  // edge stroke offset
</script>

<svelte:window bind:scrollY bind:innerHeight={winHeight} bind:innerWidth={winWidth} />

<!-- ── Back button ──────────────────────────────────────────────────── -->
{#if visible}
  <a
    href="/?start=true&step=2"
    class="back-btn"
    data-sveltekit-reload
    in:fly={{ x: -24, duration: 500, delay: 400 }}
  >
    <span class="arrow">←</span> Back
  </a>
{/if}

{#if visible}
<main class="scroll-page" in:fade={{ duration: 600 }}>

  <!-- ── Page hero ──────────────────────────────────────────────────── -->
  <div class="page-hero">
    <span class="page-tag">SEQUENCE DIAGRAM</span>
    <h1 class="page-title">The Digital Footprint</h1>
    <p class="page-subtitle">Scroll to trace how a single AI query flows through physical infrastructure</p>
  </div>

  <!-- ── SVG overlay ─────────────────────────────────────────────────── -->
  {#if docHeight > 0 && centers.length === 4}
    <svg
      class="connector-svg"
      style="height: {docHeight}px;"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <!-- Global filters (defined once) -->
      <defs>
        <filter id="blur-lg" x="-60%" y="-20%" width="220%" height="140%">
          <feGaussianBlur stdDeviation="14"/>
        </filter>
        <filter id="blur-md" x="-40%" y="-20%" width="180%" height="140%">
          <feGaussianBlur stdDeviation="5"/>
        </filter>
        <filter id="dot-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {#each [0, 1, 2] as i}
        {@const a    = centers[i]}
        {@const b    = centers[i + 1]}
        {@const prog = lineProg(i)}
        {@const col  = lineColors[i]}

        <!-- Per-ribbon defs -->
        <defs>
          <!-- Diagonal gradient aligned to the actual path direction -->
          <linearGradient
            id="rg-{i}"
            x1={a.x} y1={a.y}
            x2={b.x} y2={b.y}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%"   stop-color={col.from} stop-opacity="1"/>
            <stop offset="50%"  stop-color={col.from} stop-opacity="0.7"/>
            <stop offset="100%" stop-color={col.to}   stop-opacity="1"/>
          </linearGradient>

          <!-- Same gradient but softer, for glow layers -->
          <linearGradient
            id="rg-glow-{i}"
            x1={a.x} y1={a.y}
            x2={b.x} y2={b.y}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%"   stop-color={col.from} stop-opacity="0.6"/>
            <stop offset="100%" stop-color={col.to}   stop-opacity="0.6"/>
          </linearGradient>

          <!-- Clip rect grows top-to-bottom as progress increases -->
          <clipPath id="clip-{i}">
            <rect
              x="-99999"
              y={a.y - 80}
              width="299999"
              height={(b.y - a.y + 160) * prog}
            />
          </clipPath>
        </defs>

        <g clip-path="url(#clip-{i})">
          <!-- Layer 1 — wide diffuse halo (gives the ribbon its glow depth) -->
          <path
            d={ribbonPath(a.x, a.y, b.x, b.y, hw1)}
            fill="url(#rg-glow-{i})"
            fill-opacity="0.12"
            filter="url(#blur-lg)"
          />

          <!-- Layer 2 — mid ambient glow -->
          <path
            d={ribbonPath(a.x, a.y, b.x, b.y, hw2)}
            fill="url(#rg-glow-{i})"
            fill-opacity="0.25"
            filter="url(#blur-md)"
          />

          <!-- Layer 3 — main Sankey ribbon body -->
          <path
            d={ribbonPath(a.x, a.y, b.x, b.y, hw3)}
            fill="url(#rg-{i})"
            fill-opacity="0.45"
          />

          <!-- Layer 4 — bright inner core (thin ribbon) -->
          <path
            d={ribbonPath(a.x, a.y, b.x, b.y, hw4)}
            fill="url(#rg-{i})"
            fill-opacity="0.65"
          />

          <!-- Layer 5 — crisp top edge highlight stroke -->
          <path
            d={edgePath(a.x, a.y, b.x, b.y, -he)}
            fill="none"
            stroke="url(#rg-{i})"
            stroke-width="1"
            stroke-opacity="0.75"
          />

          <!-- Layer 6 — crisp bottom edge highlight stroke -->
          <path
            d={edgePath(a.x, a.y, b.x, b.y, he)}
            fill="none"
            stroke="url(#rg-{i})"
            stroke-width="1"
            stroke-opacity="0.4"
          />
        </g>

        <!-- Anchor dot at origin (fades in as ribbon starts drawing) -->
        {#if prog > 0.02}
          {@const ao = Math.min(prog * 6, 1)}
          <circle cx={a.x} cy={a.y} r="8"  fill={col.from} opacity={ao * 0.25} filter="url(#dot-glow)"/>
          <circle cx={a.x} cy={a.y} r="3.5" fill={col.from} opacity={ao * 0.9}/>
          <circle cx={a.x} cy={a.y} r="1.5" fill="#fff"     opacity={ao}/>
        {/if}

        <!-- Terminal dot at destination (appears when ribbon fully arrives) -->
        {#if prog >= 0.97}
          {@const to = (prog - 0.97) / 0.03}
          <circle cx={b.x} cy={b.y} r="8"  fill={col.to} opacity={to * 0.25} filter="url(#dot-glow)"/>
          <circle cx={b.x} cy={b.y} r="3.5" fill={col.to} opacity={to * 0.9}/>
          <circle cx={b.x} cy={b.y} r="1.5" fill="#fff"   opacity={to}/>
        {/if}
      {/each}
    </svg>
  {/if}

  <!-- ── Cards ─────────────────────────────────────────────────────────── -->
  <div class="zigzag-container">
    {#each nodes as node, i}
      <div class="row {node.side}">
        <!-- Text box on left for right-side cards -->
        {#if node.side === 'right' && getActive(i)}
          <div class="opp-box" in:fade={{ duration: 500 }}>
            <div class="opp-box-title">{cardInfo[i].title}</div>
            <div class="opp-box-body">{cardInfo[i].body}</div>
          </div>
        {/if}
        <div
          class="card"
          class:card-connected={i === 3 && card4Active}
          bind:this={cardRefs[i]}
        >
          {#if i === 3}
            <!-- ── Card 4: live SVG with digital power-on animation ── -->
            <div class="card4-shell" class:revealed={card4Active}>

              <!-- The actual SVG file, progressively revealed -->
              <img
                src="/image%20placeholder4.svg"
                alt="Data Center Infrastructure"
                class="card4-img"
                style="filter: brightness({card4Active ? 1 : 0.08 + card4Prog * 0.3}) saturate({card4Active ? 1.15 : 0.1})"
              />

              <!-- Scanline texture (always present, thins on reveal) -->
              <div class="scanlines" style="opacity:{card4Active ? 0.18 : 0.55}"></div>

              <!-- Animated scanner beam (hidden after reveal) -->
              {#if !card4Active}
                <div class="scan-beam"></div>
              {/if}

              <!-- Pre-connection HUD -->
              {#if !card4Active}
                <div class="pre-hud">
                  <span class="pre-hud-tag">⬡ AWAITING CONNECTION</span>
                  <span class="pre-hud-counter">{card4KbCount.toLocaleString()} / 12,847 KB</span>
                  <div class="pre-hud-bar">
                    <div class="pre-hud-fill" style="width:{card4Prog * 100}%"></div>
                  </div>
                </div>
              {/if}

              <!-- Post-connection flash badge -->
              {#if card4Active}
                <div class="signal-badge" in:fade={{ duration: 300 }}>
                  ✦ Data Connected
                </div>
              {/if}
            </div>

          {:else if i === 0}
            <!-- ── Card 1: typing image with power-on animation ── -->
            <div class="card4-shell" class:revealed={card1Active}>

              <img
                src="/typed.svg"
                alt="User typing on a device"
                class="card4-img"
                style="filter: brightness({card1Active ? 1 : 0.08 + card1Prog * 0.3}) saturate({card1Active ? 1.15 : 0.1})"
              />

              <div class="scanlines" style="opacity:{card1Active ? 0.18 : 0.55}"></div>

              {#if !card1Active}
                <div class="scan-beam"></div>
              {/if}

              {#if !card1Active}
                <div class="pre-hud">
                  <span class="pre-hud-tag">⬡ AWAITING UPLOAD</span>
                  <span class="pre-hud-counter">{card1KbCount.toLocaleString()} / 4,096 KB</span>
                  <div class="pre-hud-bar">
                    <div class="pre-hud-fill" style="width:{card1Prog * 100}%"></div>
                  </div>
                </div>
              {/if}

              {#if card1Active}
                <div class="signal-badge" in:fade={{ duration: 300 }}>
                  ✦ Data Uploaded
                </div>
              {/if}
            </div>
          {:else if i === 1}
            <!-- ── Card 2: datacenter SVG with scroll-driven power-on ── -->
            <div class="card4-shell" class:revealed={card2Active}>

              <img
                src="/datacenter.svg"
                alt="Hyperscale Datacenter"
                class="card4-img"
                style="filter: brightness({card2Active ? 1 : 0.08 + card2Prog * 0.3}) saturate({card2Active ? 1.15 : 0.1})"
              />

              <div class="scanlines" style="opacity:{card2Active ? 0.18 : 0.55}"></div>

              {#if !card2Active}
                <div class="scan-beam"></div>
              {/if}

              {#if !card2Active}
                <div class="pre-hud">
                  <span class="pre-hud-tag">⬡ RECEIVING DATA</span>
                  <span class="pre-hud-counter">{card2KbCount.toLocaleString()} / 65,536 KB</span>
                  <div class="pre-hud-bar">
                    <div class="pre-hud-fill" style="width:{card2Prog * 100}%"></div>
                  </div>
                </div>
              {/if}

              {#if card2Active}
                <div class="signal-badge" in:fade={{ duration: 300 }}>
                  ✦ Data Received by Datacenter
                </div>
              {/if}
            </div>

          {:else}
            <!-- ── Card 3: server rack with power-on animation ── -->
            <div class="card4-shell" class:revealed={card3Active}>
              <img
                src="/server.svg"
                alt="Data being processed inside a server rack"
                class="card4-img"
                style="filter: brightness({card3Active ? 1 : 0.08 + card3Prog * 0.3}) saturate({card3Active ? 1.15 : 0.1})"
              />

              <div class="scanlines" style="opacity:{card3Active ? 0.18 : 0.55}"></div>

              {#if !card3Active}
                <div class="scan-beam"></div>
              {/if}

              {#if !card3Active}
                <div class="pre-hud">
                  <span class="pre-hud-tag">⬡ PROCESSING DATA</span>
                  <span class="pre-hud-counter">{card3KbCount.toLocaleString()} / 32,768 KB</span>
                  <div class="pre-hud-bar">
                    <div class="pre-hud-fill" style="width:{card3Prog * 100}%"></div>
                  </div>
                </div>
              {/if}

              {#if card3Active}
                <div class="signal-badge" in:fade={{ duration: 300 }}>
                  ✦ Processing Complete
                </div>
              {/if}
            </div>
          {/if}

          <div class="card-label">{node.label}</div>
        </div>
        <!-- Text box on right for left-side cards -->
        {#if node.side === 'left' && getActive(i)}
          <div class="opp-box" in:fade={{ duration: 500 }}>
            <div class="opp-box-title">{cardInfo[i].title}</div>
            <div class="opp-box-body">{cardInfo[i].body}</div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

</main>
{/if}

<style>
  :global(html) {
    overflow-x: hidden;
    overflow-y: scroll;
    scroll-behavior: smooth;
  }
  :global(body) {
    margin: 0;
    background: #050010;
    color: #fff;
    font-family: 'Corpta', monospace;
    height: auto;
    min-height: 100%;
  }

  /* ── Back button ─────────────────────────────── */
  .back-btn {
    position: fixed;
    top: calc(40px + 0.75rem);
    left: 1.25rem;
    z-index: 200;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: #bdffff;
    text-decoration: none;
    font-family: 'Corpta', monospace;
    font-size: 0.7rem;
    letter-spacing: 2px;
    text-transform: uppercase;
    background: rgba(5, 0, 16, 0.75);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(189, 255, 255, 0.18);
    border-radius: 8px;
    padding: 0.55rem 1rem;
    transition: gap 0.25s, border-color 0.25s, box-shadow 0.25s;
  }
  .back-btn:hover {
    gap: 0.85rem;
    border-color: rgba(189, 255, 255, 0.45);
    box-shadow: 0 0 16px rgba(189, 255, 255, 0.12);
  }
  .arrow { font-size: 0.85rem; line-height: 1; }

  /* ── Page hero ───────────────────────────────── */
  .page-hero {
    position: relative;
    z-index: 2;
    text-align: center;
    padding: 5vh 2rem 6vh;
    max-width: 560px;
    margin: 0 auto;
  }
  .page-tag {
    display: block;
    font-size: 0.48rem;
    letter-spacing: 4px;
    color: rgba(189, 255, 255, 0.35);
    font-family: 'Corpta', monospace;
    margin-bottom: 0.9rem;
    text-transform: uppercase;
  }
  .page-title {
    font-size: clamp(1.8rem, 3.5vw, 2.8rem);
    color: #bdffff;
    margin: 0 0 0.9rem;
    letter-spacing: 0.06em;
    font-family: 'Corpta', monospace;
    font-weight: normal;
  }
  .page-subtitle {
    font-size: 0.72rem;
    color: rgba(189, 255, 255, 0.35);
    line-height: 1.7;
    font-family: 'Space Grotesk', sans-serif;
    margin: 0;
  }

  /* ── Page layout ─────────────────────────────── */
  .scroll-page {
    min-height: 100vh;
    padding: 4vh 0 28vh;
    position: relative;
    overflow: visible;
    touch-action: pan-y;
  }

  .connector-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    pointer-events: none;
    z-index: 1;
    overflow: visible;
  }

  /* ── Zigzag layout ───────────────────────────── */
  .zigzag-container {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 36vh;           /* vertical breathing room between nodes */
    padding: 0 6vw;
  }

  .row { display: flex; width: 100%; align-items: center; gap: 2vw; padding: 0 4vw; }
  .row.left  { /* card naturally at left */ }
  .row.right .card { margin-left: auto; }

  /* Opposite-side info boxes */
  .opp-box {
    width: clamp(160px, 24vw, 320px);
    flex-shrink: 0;
    background: rgba(8, 5, 22, 0.88);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(189, 255, 255, 0.18);
    border-radius: 14px;
    padding: 1.1rem 1.3rem;
    box-shadow: 0 0 30px rgba(0,0,0,0.5), 0 0 14px rgba(189,255,255,0.06);
  }
  .row.left .opp-box { margin-left: auto; }
  .opp-box-title {
    font-size: 0.48rem;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: #bdffff;
    font-family: 'Corpta', monospace;
    margin-bottom: 0.6rem;
  }
  .opp-box-body {
    font-size: 0.68rem;
    color: rgba(189, 255, 255, 0.55);
    line-height: 1.75;
    font-family: 'Space Grotesk', sans-serif;
  }

  /* ── Cards ───────────────────────────────────── */
  .card {
    width: clamp(300px, 40vw, 560px);
    background: rgba(8, 5, 22, 0.88);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(189, 255, 255, 0.14);
    border-radius: 18px;
    overflow: hidden;
    box-shadow:
      0 0 50px rgba(0, 0, 0, 0.65),
      0 0 0 1px rgba(189, 255, 255, 0.04);
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .card:hover {
    border-color: rgba(189, 255, 255, 0.32);
    box-shadow:
      0 0 70px rgba(0, 0, 0, 0.8),
      0 0 24px rgba(189, 255, 255, 0.1);
  }

  .image-placeholder {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: rgba(189, 255, 255, 0.02);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-label {
    padding: 0.9rem 1.35rem;
    font-size: 0.62rem;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: rgba(189, 255, 255, 0.45);
    border-top: 1px solid rgba(189, 255, 255, 0.07);
    font-family: 'Corpta', monospace;
  }

  /* ── Card 4 connected state ───────────────────── */
  .card.card-connected {
    border-color: rgba(189, 255, 255, 0.45);
    animation: border-pulse 2.8s ease-in-out infinite;
  }
  @keyframes border-pulse {
    0%, 100% { box-shadow: 0 0 40px rgba(0,0,0,0.6), 0 0 16px rgba(189,255,255,0.12); }
    50%       { box-shadow: 0 0 40px rgba(0,0,0,0.6), 0 0 40px rgba(189,255,255,0.32), inset 0 0 24px rgba(189,255,255,0.06); }
  }

  /* ── Card 4 shell ─────────────────────────────── */
  .card4-shell {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background: #000;
  }

  /* The SVG/image — absolutely fills the shell so every card is pixel-identical */
  .card4-img {
    position: absolute;
    top: 0; left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center center;
    display: block;
    transition: filter 0.6s ease;
  }

  /* Power-on flash when the line arrives */
  .card4-shell.revealed .card4-img {
    animation: power-on 1.4s ease forwards;
  }
  @keyframes power-on {
    0%   { filter: brightness(0.08) saturate(0.1); }
    12%  { filter: brightness(3.5)  saturate(0)  blur(1px); }  /* bright flash */
    28%  { filter: brightness(0.4)  saturate(0.2); }
    60%  { filter: brightness(1.2)  saturate(1.0); }
    100% { filter: brightness(1.0)  saturate(1.15) contrast(1.05); }
  }

  /* Horizontal scanlines overlay */
  .scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(0, 0, 0, 0.45) 3px,
      rgba(0, 0, 0, 0.45) 4px
    );
    pointer-events: none;
    transition: opacity 1s ease;
    z-index: 2;
  }

  /* Sweeping scanner beam pre-connection */
  .scan-beam {
    position: absolute;
    left: 0; right: 0;
    height: 3px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(189, 255, 255, 0.7) 40%,
      rgba(255, 255, 255, 0.9) 50%,
      rgba(189, 255, 255, 0.7) 60%,
      transparent 100%
    );
    box-shadow: 0 0 12px 3px rgba(189, 255, 255, 0.4);
    animation: scan-sweep 1.6s linear infinite;
    z-index: 3;
    pointer-events: none;
  }
  @keyframes scan-sweep {
    from { top: -3px; }
    to   { top: 100%; }
  }

  /* Pre-connection data HUD */
  .pre-hud {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    padding: 0.7rem 1rem 0.8rem;
    background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    z-index: 4;
    pointer-events: none;
  }
  .pre-hud-tag {
    font-size: 0.55rem;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: rgba(189, 255, 255, 0.7);
    animation: text-blink 1.1s step-end infinite;
  }
  @keyframes text-blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.3; }
  }
  .pre-hud-counter {
    font-size: 0.58rem;
    letter-spacing: 1px;
    color: rgba(189, 255, 255, 0.5);
    font-variant-numeric: tabular-nums;
  }
  .pre-hud-bar {
    height: 2px;
    background: rgba(189, 255, 255, 0.12);
    border-radius: 1px;
    overflow: hidden;
  }
  .pre-hud-fill {
    height: 100%;
    background: linear-gradient(90deg, #ffd580, #bdffff);
    box-shadow: 0 0 6px rgba(189, 255, 255, 0.6);
    transition: width 0.15s linear;
  }

  /* Post-connection badge */
  .signal-badge {
    position: absolute;
    top: 0.9rem; left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(189, 255, 255, 0.35);
    border-radius: 4px;
    padding: 0.3rem 0.85rem;
    font-size: 0.55rem;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #bdffff;
    white-space: nowrap;
    animation: badge-life 3.5s ease forwards;
  }
  @keyframes badge-life {
    0%   { opacity: 0; transform: translateX(-50%) translateY(-4px); }
    10%  { opacity: 1; transform: translateX(-50%) translateY(0); }
    70%  { opacity: 1; }
    100% { opacity: 0; }
  }

  /* ── Mobile ──────────────────────────────────── */
  @media (max-width: 640px) {
    .scroll-page {
      padding: 2vh 0 18vh;
    }

    .page-hero {
      padding: 3vh 1.25rem 4vh;
    }

    .page-title {
      font-size: clamp(1.3rem, 7vw, 1.9rem);
    }

    .page-subtitle {
      font-size: 0.68rem;
    }

    /* Tighter zigzag — cards are narrower so left+right fit the viewport */
    .zigzag-container {
      gap: 16vh;
      padding: 0 0.5rem;
    }

    .row { flex-wrap: wrap; gap: 0.75rem; padding: 0 1vw; align-items: flex-start; }
    .row.right .card { margin-left: auto; }
    .opp-box { width: 100% !important; order: 10; margin-left: 0 !important; }

    .card {
      width: min(56vw, 230px);
    }

    .pre-hud-tag,
    .pre-hud-counter {
      font-size: 0.52rem;
    }

    .signal-badge {
      font-size: 0.5rem;
      padding: 0.25rem 0.65rem;
      letter-spacing: 2px;
    }

    .card-label {
      font-size: 0.58rem;
      padding: 0.75rem 1rem;
    }

    .back-btn {
      font-size: 0.62rem;
      padding: 0.45rem 0.75rem;
    }
  }
</style>