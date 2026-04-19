<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import rawVegaData from '../../data/gpt_query_data.json';

  // ── Real data ─────────────────────────────────────────────────────────────
  // IEA Electricity 2024 report — global data center energy (TWh/year)
  const energyData = [
    { year: '2017', twh: 200, projected: false },
    { year: '2019', twh: 207, projected: false },
    { year: '2021', twh: 220, projected: false },
    { year: '2022', twh: 240, projected: false },
    { year: '2023', twh: 415, projected: false },
    { year: '2026', twh: 945, projected: true },
  ];

  // Company ESG/Sustainability Reports 2022 — water withdrawals (billion gallons)
  const waterData = [
    { company: 'Google',    bg: 5.6 },
    { company: 'Amazon',    bg: 3.7 },
    { company: 'Microsoft', bg: 1.7 },
    { company: 'Meta',      bg: 1.3 },
  ];

  // ChatGPT query growth from project data file
  const datasets   = (rawVegaData as any).datasets;
  const datasetKey = Object.keys(datasets)[0];
  const queryData: { date: string; val: number }[] = datasets[datasetKey]
    .map((d: any) => ({ date: d.Month_Label, val: d.Queries_Billions }));

  // ── Live counters ─────────────────────────────────────────────────────────
  // US data centers: ~260 TWh/yr → 8,228 kWh/s  |  ~150B gal/yr → 4,756 gal/s
  const KWH_PER_S = 8228;
  const GAL_PER_S = 4756;

  let elapsed      = $state(0);
  let waterGallons = $derived(Math.floor(elapsed * GAL_PER_S));
  let energyKwh    = $derived(Math.floor(elapsed * KWH_PER_S));

  // ── Calculator ────────────────────────────────────────────────────────────
  // Sources: Goldman Sachs Research 2024, UC Riverside 2023, US EPA grid average
  let dailyQueries     = $state(10);
  let annualEnergyKwh  = $derived(dailyQueries * 365 * 0.003);
  let annualWaterL     = $derived(dailyQueries * 365 * 0.02);     // 20 ml/query
  let annualCO2kg      = $derived(annualEnergyKwh * 0.386);
  let annualBottles    = $derived(Math.round(annualWaterL / 0.5));
  let phoneCharges     = $derived(Math.round(annualEnergyKwh / 0.015));
  let kmDriven         = $derived(Math.round(annualCO2kg / 0.12));
  let vsGoogle         = $derived(dailyQueries * 10);

  // ── Scroll visibility ─────────────────────────────────────────────────────
  let visible         = $state(false);
  let visibleSections = $state(new Set<string>());

  function observe(node: HTMLElement): { destroy: () => void } {
    const id = node.dataset.section!;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          visibleSections = new Set([...visibleSections, id]);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  // ── Chart constants ───────────────────────────────────────────────────────
  const MAX_TWH = 945;
  const MAX_BG  = 5.6;
  const BAR_W   = 58;
  const CHART_H = 220;
  const BAR_BASE = 260;

  // Line chart (SVG 660×180)
  const QW = 660, QH = 170;
  const maxQ = Math.max(...queryData.map(d => d.val));
  function qx(i: number) { return (i / (queryData.length - 1)) * QW; }
  function qy(v: number)  { return QH - (v / maxQ) * QH * 0.88; }
  const queryPolyline = queryData.map((d, i) => `${qx(i).toFixed(1)},${qy(d.val).toFixed(1)}`).join(' ');
  const queryAreaPath  = [
    `M0,${QH}`,
    ...queryData.map((d, i) => `L${qx(i).toFixed(1)},${qy(d.val).toFixed(1)}`),
    `L${QW},${QH} Z`,
  ].join(' ');

  let timerInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    const t0 = Date.now();
    timerInterval = setInterval(() => { elapsed = (Date.now() - t0) / 1000; }, 100);
    requestAnimationFrame(() => { visible = true; });
  });

  onDestroy(() => clearInterval(timerInterval));

  function fmt(n: number)           { return Math.round(n).toLocaleString(); }
  function fmtDec(n: number, d = 1) { return n.toFixed(d); }

  // X-label indices for query chart
  const labelIndices = new Set([0, 6, 12, 18, 24, queryData.length - 1]);
</script>

<svelte:head>
  <title>The Invisible Weight — AI Infrastructure Impact</title>
</svelte:head>

<!-- Fixed back button -->
{#if visible}
  <a href="/?start=true&step=4" class="back-btn" data-sveltekit-reload>
    ← Back to Map
  </a>
{/if}

<div class="page">

  <!-- ═══════════════════════════════ HERO ══════════════════════════════════ -->
  {#if visible}
    <section class="hero">
      <div class="hero-text">
        <span class="eyebrow">ENVIRONMENTAL IMPACT</span>
        <h1>The Invisible<br>Weight</h1>
        <p class="lead">
          Every AI query draws power from the grid, drains water from local aquifers,
          and releases carbon into the atmosphere. The infrastructure is physical.
          The consequences are permanent at scale. The scale is accelerating.
        </p>
      </div>

      <div class="live-block">
        <p class="live-label">Since you opened this page, US data centers have consumed:</p>
        <div class="live-row">
          <div class="live-item">
            <div class="live-num">{fmt(waterGallons)}</div>
            <div class="live-unit">GALLONS OF WATER</div>
          </div>
          <div class="live-sep">+</div>
          <div class="live-item">
            <div class="live-num">{fmt(energyKwh)}</div>
            <div class="live-unit">KILOWATT-HOURS</div>
          </div>
        </div>
        <p class="live-src">Based on IEA (2024) &amp; NRDC estimates — US data centers only</p>
      </div>
    </section>
  {/if}

  <!-- ══════════════════════════ SECTION 1: ENERGY ═════════════════════════ -->
  <section class="ns" data-section="energy" use:observe>

    <div class="st" class:in={visibleSections.has('energy')}>
      <span class="eyebrow">01 — THE ENERGY HUNGER</span>
      <h2>A decade of efficiency, erased in one year</h2>
      <p>
        For nearly a decade, global data center electricity held surprisingly flat —
        efficiency gains absorbed explosive traffic growth. Then came AI.
        In 2023 alone, consumption nearly doubled. The IEA now projects data center
        demand will reach <strong>945 TWh by 2026</strong> — surpassing Japan's entire national grid.
      </p>
    </div>

    <div class="chart-wrap" class:in={visibleSections.has('energy')}>
      <svg viewBox="0 0 680 300" class="svg-chart" role="img" aria-label="Bar chart: global data center energy consumption 2017–2026">
        <!-- Grid lines -->
        {#each [0, 200, 400, 600, 800, 945] as tick}
          {@const gy = BAR_BASE - (tick / MAX_TWH) * CHART_H}
          <line x1="58" x2="678" y1={gy} y2={gy} class="grid-line" />
          <text x="52" y={gy + 4} text-anchor="end" class="ax-txt">{tick}</text>
        {/each}

        <!-- Bars -->
        {#each energyData as d, i}
          {@const fullH = (d.twh / MAX_TWH) * CHART_H}
          {@const bx    = 68 + i * 100}
          {@const anim  = visibleSections.has('energy')}
          <rect
            x={bx}
            y={BAR_BASE - fullH}
            width={BAR_W}
            height={fullH}
            class:bar-proj={d.projected}
            class="bar"
            style="
              transform-box: fill-box;
              transform-origin: bottom;
              transform: scaleY({anim ? 1 : 0});
              transition: transform 0.75s cubic-bezier(0.4,0,0.2,1) {i * 0.11}s;
            "
          />
          <text x={bx + BAR_W / 2} y={BAR_BASE + 16} text-anchor="middle" class="ax-txt year-lbl" class:proj-lbl={d.projected}>{d.year}</text>
          {#if anim}
            <text x={bx + BAR_W / 2} y={BAR_BASE - fullH - 7} text-anchor="middle" class="bar-val" class:bar-val-proj={d.projected}>{d.twh}</text>
          {/if}
        {/each}

        <!-- Y-axis title -->
        <text transform="translate(14,145) rotate(-90)" text-anchor="middle" class="ax-title">TWh / year</text>
      </svg>

      <div class="legend">
        <span class="leg leg-c">Historical (IEA 2024)</span>
        <span class="leg leg-r">2026 Projected (IEA)</span>
      </div>
    </div>

    <div class="callout-row" class:in={visibleSections.has('energy')}>
      <div class="callout">
        <span class="cn">×2.3</span>
        <span class="ct">projected growth<br>2023 → 2026</span>
      </div>
      <div class="callout">
        <span class="cn">+175 TWh</span>
        <span class="ct">added in 2023 alone —<br>equal to all of Argentina's grid</span>
      </div>
      <div class="callout">
        <span class="cn">1,287 MWh</span>
        <span class="ct">to train GPT-3 once —<br>552 metric tons CO₂ (Strubell et al.)</span>
      </div>
    </div>

  </section>

  <!-- ══════════════════════════ SECTION 2: WATER ══════════════════════════ -->
  <section class="ns" data-section="water" use:observe>

    <div class="st" class:in={visibleSections.has('water')}>
      <span class="eyebrow">02 — THE THIRST</span>
      <h2>Water is the invisible coolant</h2>
      <p>
        Servers run hot. Cooling them requires billions of gallons of water per year —
        drawn from municipal supplies, rivers, and aquifers that local communities
        depend on. In drought-stressed regions, data centers compete directly with
        farms and families for a finite resource.
      </p>
    </div>

    <div class="h-bars" class:in={visibleSections.has('water')}>
      {#each waterData as d, i}
        {@const pct = visibleSections.has('water') ? (d.bg / MAX_BG) * 100 : 0}
        <div class="hb-row" style="--delay: {i * 0.1}s">
          <div class="hb-co">{d.company}</div>
          <div class="hb-track">
            <div class="hb-fill" style="width: {pct}%; transition: width 0.85s cubic-bezier(0.4,0,0.2,1) {i * 0.1}s" />
            <span class="hb-val">{d.bg}B gal</span>
          </div>
        </div>
      {/each}
      <p class="src-note">Source: Company ESG &amp; Sustainability Reports, 2022</p>
    </div>

    <div class="fact-strip" class:in={visibleSections.has('water')}>
      <div class="fact-card">
        <div class="fact-n">500 ml</div>
        <div class="fact-d">of water per ChatGPT conversation (20–50 prompts)</div>
        <div class="fact-s">UC Riverside, 2023</div>
      </div>
      <div class="fact-card">
        <div class="fact-n">1M+ gal</div>
        <div class="fact-d">evaporated daily at a single hyperscale campus</div>
        <div class="fact-s">NRDC estimate</div>
      </div>
      <div class="fact-card">
        <div class="fact-n">360K gal</div>
        <div class="fact-d">daily draw in Amazon's proposed Gilroy, CA facility</div>
        <div class="fact-s">Gilroy Dispatch, 2024</div>
      </div>
    </div>

  </section>

  <!-- ══════════════════════════ SECTION 3: CALCULATOR ═════════════════════ -->
  <section class="ns" data-section="calc" use:observe>

    <div class="st" class:in={visibleSections.has('calc')}>
      <span class="eyebrow">03 — YOUR FOOTPRINT</span>
      <h2>How heavy is your usage?</h2>
      <p>
        The cost of a single query is easy to dismiss. The cost of billions is not.
        Drag the slider to see what your AI habits extract from the planet each year.
      </p>
    </div>

    <div class="calc" class:in={visibleSections.has('calc')}>
      <div class="slider-block">
        <div class="slider-header">
          <span class="slider-label">Daily AI queries</span>
          <strong class="slider-val">{dailyQueries}</strong>
        </div>
        <input type="range" min="1" max="100" bind:value={dailyQueries} class="range" />
        <div class="range-ticks">
          <span>1</span><span>25</span><span>50</span><span>75</span><span>100</span>
        </div>
      </div>

      <div class="metrics">
        <div class="metric">
          <div class="metric-val cyan">{fmtDec(annualEnergyKwh, 1)}<span class="mu">kWh</span></div>
          <div class="metric-lbl">ANNUAL ENERGY</div>
          <div class="metric-cmp">≈ {fmt(phoneCharges)} phone charges</div>
        </div>
        <div class="metric">
          <div class="metric-val coral">{fmtDec(annualWaterL, 1)}<span class="mu">L</span></div>
          <div class="metric-lbl">ANNUAL WATER</div>
          <div class="metric-cmp">≈ {fmt(annualBottles)} × 500 ml bottles</div>
        </div>
        <div class="metric">
          <div class="metric-val">{fmtDec(annualCO2kg, 2)}<span class="mu">kg CO₂</span></div>
          <div class="metric-lbl">ANNUAL CARBON</div>
          <div class="metric-cmp">≈ {fmt(kmDriven)} km driven</div>
        </div>
      </div>

      <div class="vs-bar">
        Your {dailyQueries} AI {dailyQueries === 1 ? 'query' : 'queries'}/day use the same energy as
        <strong>{fmt(vsGoogle)} Google searches</strong> daily
      </div>
    </div>
    <p class="src-note" style="margin-top: 0.75rem">
      Per query: 0.003 kWh (Goldman Sachs Research, 2024) · 20 ml water (UC Riverside, 2023) · 0.386 kg CO₂/kWh (US EPA, 2022)
    </p>

  </section>

  <!-- ══════════════════════════ SECTION 4: GROWTH ════════════════════════ -->
  <section class="ns" data-section="growth" use:observe>

    <div class="st" class:in={visibleSections.has('growth')}>
      <span class="eyebrow">04 — THE ACCELERATION</span>
      <h2>A demand that will not slow</h2>
      <p>
        ChatGPT reached 100 million users in two months — faster than any consumer
        platform in history. Every new model, every new integration, every productivity
        claim adds to the load. The infrastructure required to serve it must keep pace.
        The curve is not flattening.
      </p>
    </div>

    <div class="lc-wrap" class:in={visibleSections.has('growth')}>
      <svg viewBox="0 0 {QW} {QH + 36}" class="svg-chart line-svg" role="img" aria-label="Line chart: ChatGPT monthly query growth Nov 2022 to Mar 2026">
        <defs>
          <linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#bdffff" stop-opacity="0.14" />
            <stop offset="100%" stop-color="#bdffff" stop-opacity="0.01" />
          </linearGradient>
          <clipPath id="lc-clip">
            <rect
              x="0" y="0" height={QH + 10}
              style="
                width: {visibleSections.has('growth') ? QW : 0}px;
                transition: width 2.2s cubic-bezier(0.4,0,0.2,1) 0.3s;
              "
            />
          </clipPath>
        </defs>

        <!-- Area + line clipped to reveal left→right -->
        <path d={queryAreaPath}   fill="url(#area-g)"   clip-path="url(#lc-clip)" />
        <polyline points={queryPolyline} fill="none" stroke="#bdffff" stroke-width="1.8"
                  stroke-linejoin="round" clip-path="url(#lc-clip)" />

        <!-- X-axis date labels -->
        {#each queryData as d, i}
          {#if labelIndices.has(i)}
            <text x={qx(i)} y={QH + 24} text-anchor="middle" class="ax-txt q-lbl">{d.date.slice(0, 7)}</text>
          {/if}
        {/each}

        <!-- Peak marker -->
        <circle cx={qx(queryData.length - 1)} cy={qy(queryData[queryData.length - 1].val)} r="4.5" fill="#ff9b9b" />
        <text x={qx(queryData.length - 1) - 10} y={qy(queryData[queryData.length - 1].val) - 11} text-anchor="end" class="peak-lbl">
          {queryData[queryData.length - 1].val.toFixed(1)}B / month
        </text>
      </svg>
      <p class="src-note">ChatGPT monthly query estimates, Nov 2022 – Mar 2026 (SimilarWeb &amp; public reports)</p>
    </div>

  </section>

  <!-- ══════════════════════════ SECTION 5: CTA ═════════════════════════════ -->
  <section class="ns cta-ns" data-section="cta" use:observe>

    <div class="st" class:in={visibleSections.has('cta')}>
      <span class="eyebrow">05 — WHAT MUST CHANGE</span>
      <h2>The weight belongs<br>to everyone</h2>
      <p>
        Designers, engineers, product teams, and policymakers must confront the physical
        consequences of digital growth. Transparency, efficiency standards, and
        community consent are not optional — they are the minimum viable standard.
        The invisible must be made visible. And then made smaller.
      </p>
    </div>

    <div class="cta-row" class:in={visibleSections.has('cta')}>
      <a class="cta-btn" href="/?start=true&step=4" data-sveltekit-reload>← Back to Map</a>
      <a class="cta-btn cta-sec" href="/digital-footprint">Digital Footprint →</a>
    </div>

  </section>

</div>

<style>
  :global(body) {
    margin: 0;
    background: #050010;
    font-family: 'IBM Plex Mono', monospace;
    color: #fff;
    overflow-x: hidden;
  }

  /* ── Back button ──────────────────────────────────────────────── */
  .back-btn {
    position: fixed;
    top: 1.25rem;
    left: 1.25rem;
    z-index: 300;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: #bdffff;
    text-decoration: none;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 2px;
    text-transform: uppercase;
    background: rgba(5, 0, 16, 0.85);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(189, 255, 255, 0.18);
    border-radius: 8px;
    padding: 0.5rem 1rem;
    transition: border-color 0.25s, box-shadow 0.25s;
  }
  .back-btn:hover {
    border-color: rgba(189, 255, 255, 0.5);
    box-shadow: 0 0 18px rgba(189, 255, 255, 0.12);
  }

  /* ── Page layout ──────────────────────────────────────────────── */
  .page {
    max-width: 820px;
    margin: 0 auto;
    padding: 5.5rem 2rem 9rem;
    display: flex;
    flex-direction: column;
    gap: 8rem;
  }

  /* ── Shared typography ────────────────────────────────────────── */
  .eyebrow {
    display: block;
    font-size: 0.55rem;
    letter-spacing: 4px;
    color: #bdffff;
    opacity: 0.45;
    margin-bottom: 1rem;
    font-family: 'IBM Plex Mono', monospace;
    text-transform: uppercase;
  }
  h1 {
    font-size: clamp(2.6rem, 7vw, 4.8rem);
    color: #bdffff;
    margin: 0 0 1.5rem;
    line-height: 1.05;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  h2 {
    font-size: clamp(1.5rem, 3.5vw, 2.2rem);
    color: #bdffff;
    margin: 0 0 1.25rem;
    line-height: 1.15;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
  }
  .lead {
    font-size: 1rem;
    color: #6a6a7a;
    line-height: 1.85;
    font-family: 'Space Grotesk', sans-serif;
    max-width: 600px;
    margin: 0;
  }
  .src-note {
    font-size: 0.52rem;
    color: #2e2e3e;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.5px;
    margin: 0.6rem 0 0;
    line-height: 1.7;
  }

  /* ── Hero ─────────────────────────────────────────────────────── */
  .hero { display: flex; flex-direction: column; gap: 3rem; }

  .live-block {
    background: rgba(189, 255, 255, 0.025);
    border: 1px solid rgba(189, 255, 255, 0.1);
    border-radius: 16px;
    padding: 2rem 2.25rem;
  }
  .live-label {
    font-size: 0.58rem;
    letter-spacing: 2px;
    color: #3a3a4a;
    font-family: 'IBM Plex Mono', monospace;
    text-transform: uppercase;
    margin: 0 0 1.5rem;
  }
  .live-row {
    display: flex;
    align-items: flex-end;
    gap: 2.5rem;
    flex-wrap: wrap;
  }
  .live-item { min-width: 160px; }
  .live-num {
    font-size: clamp(1.7rem, 3.5vw, 2.6rem);
    color: #ff9b9b;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 0.4rem;
  }
  .live-unit {
    font-size: 0.48rem;
    letter-spacing: 3px;
    color: #383848;
    font-family: 'IBM Plex Mono', monospace;
  }
  .live-sep {
    font-size: 1.4rem;
    color: #2a2a3a;
    font-family: 'IBM Plex Mono', monospace;
    padding-bottom: 0.5rem;
    flex-shrink: 0;
  }

  /* ── Narrative section ────────────────────────────────────────── */
  .ns { display: flex; flex-direction: column; gap: 2.5rem; }

  .st {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity 0.7s ease, transform 0.7s ease;
  }
  .st p {
    font-size: 0.92rem;
    color: #5a5a6a;
    line-height: 1.9;
    font-family: 'Space Grotesk', sans-serif;
    max-width: 620px;
    margin: 0;
  }
  .st p strong { color: #bdffff; font-weight: 600; }
  .st.in { opacity: 1; transform: translateY(0); }

  /* ── SVG chart wrapper ────────────────────────────────────────── */
  .chart-wrap {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.7s ease 0.18s, transform 0.7s ease 0.18s;
  }
  .chart-wrap.in { opacity: 1; transform: translateY(0); }

  .svg-chart { width: 100%; overflow: visible; }

  .grid-line { stroke: rgba(255,255,255,0.04); stroke-width: 1; }
  .ax-txt { fill: #383848; font-size: 10px; font-family: 'IBM Plex Mono', monospace; }
  .year-lbl { fill: #4a4a5a; }
  .proj-lbl { fill: #ff9b9b; }
  .ax-title { fill: #383848; font-size: 9px; font-family: 'IBM Plex Mono', monospace; }
  .bar-val { fill: #bdffff; font-size: 9px; font-family: 'IBM Plex Mono', monospace; opacity: 0.7; }
  .bar-val-proj { fill: #ff9b9b; }

  .bar      { fill: rgba(189, 255, 255, 0.35); }
  .bar-proj { fill: rgba(255, 155, 155, 0.55); }

  .legend {
    display: flex;
    gap: 1.75rem;
    margin-top: 0.85rem;
    flex-wrap: wrap;
  }
  .leg {
    font-size: 0.58rem;
    letter-spacing: 1px;
    font-family: 'IBM Plex Mono', monospace;
    color: #444;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .leg::before {
    content: '';
    width: 22px;
    height: 3px;
    border-radius: 2px;
    display: inline-block;
  }
  .leg-c::before { background: rgba(189, 255, 255, 0.45); }
  .leg-r::before { background: rgba(255, 155, 155, 0.65); }

  /* ── Callout row ──────────────────────────────────────────────── */
  .callout-row {
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
    opacity: 0;
    transform: translateY(14px);
    transition: opacity 0.6s ease 0.35s, transform 0.6s ease 0.35s;
  }
  .callout-row.in { opacity: 1; transform: translateY(0); }
  .callout {
    flex: 1;
    min-width: 160px;
    border-left: 2px solid rgba(189,255,255,0.1);
    padding: 0.4rem 0 0.4rem 1.1rem;
  }
  .cn {
    display: block;
    font-size: 1.45rem;
    color: #ff9b9b;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    line-height: 1.1;
    margin-bottom: 0.4rem;
  }
  .ct {
    font-size: 0.68rem;
    color: #484858;
    font-family: 'Space Grotesk', sans-serif;
    line-height: 1.55;
  }

  /* ── Horizontal bars (water) ──────────────────────────────────── */
  .h-bars {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.7s ease 0.18s, transform 0.7s ease 0.18s;
  }
  .h-bars.in { opacity: 1; transform: translateY(0); }

  .hb-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .hb-co {
    width: 80px;
    font-size: 0.62rem;
    letter-spacing: 1px;
    color: #4a4a5a;
    font-family: 'IBM Plex Mono', monospace;
    flex-shrink: 0;
  }
  .hb-track {
    flex: 1;
    height: 30px;
    background: rgba(255,255,255,0.025);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .hb-fill {
    height: 100%;
    background: linear-gradient(90deg, rgba(189,255,255,0.25), rgba(189,255,255,0.45));
    border-radius: 4px;
    width: 0%;
  }
  .hb-val {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.6rem;
    color: #bdffff;
    font-family: 'IBM Plex Mono', monospace;
    white-space: nowrap;
  }

  /* ── Fact strip ───────────────────────────────────────────────── */
  .fact-strip {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 1rem;
    opacity: 0;
    transform: translateY(14px);
    transition: opacity 0.6s ease 0.35s, transform 0.6s ease 0.35s;
  }
  .fact-strip.in { opacity: 1; transform: translateY(0); }

  .fact-card {
    background: rgba(255,255,255,0.018);
    border: 1px solid rgba(189,255,255,0.07);
    border-radius: 12px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    transition: border-color 0.25s;
  }
  .fact-card:hover { border-color: rgba(189,255,255,0.2); }
  .fact-n {
    font-size: 1.4rem;
    color: #ff9b9b;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    line-height: 1;
  }
  .fact-d {
    font-size: 0.72rem;
    color: #555566;
    font-family: 'Space Grotesk', sans-serif;
    line-height: 1.5;
  }
  .fact-s {
    font-size: 0.52rem;
    color: #2e2e3e;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 1px;
  }

  /* ── Calculator ───────────────────────────────────────────────── */
  .calc {
    background: rgba(189,255,255,0.018);
    border: 1px solid rgba(189,255,255,0.09);
    border-radius: 18px;
    padding: 2.25rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.7s ease 0.18s, transform 0.7s ease 0.18s;
  }
  .calc.in { opacity: 1; transform: translateY(0); }

  .slider-block { display: flex; flex-direction: column; gap: 0.85rem; }
  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .slider-label {
    font-size: 0.6rem;
    letter-spacing: 2px;
    color: #4a4a5a;
    font-family: 'IBM Plex Mono', monospace;
    text-transform: uppercase;
  }
  .slider-val {
    font-size: 1.5rem;
    color: #bdffff;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    line-height: 1;
  }

  .range {
    width: 100%;
    appearance: none;
    -webkit-appearance: none;
    height: 3px;
    background: rgba(189,255,255,0.12);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  .range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #bdffff;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(189,255,255,0.55);
    transition: box-shadow 0.2s;
  }
  .range::-webkit-slider-thumb:hover { box-shadow: 0 0 20px rgba(189,255,255,0.8); }
  .range::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #bdffff;
    cursor: pointer;
    border: none;
    box-shadow: 0 0 12px rgba(189,255,255,0.55);
  }
  .range-ticks {
    display: flex;
    justify-content: space-between;
    font-size: 0.52rem;
    color: #2e2e3e;
    font-family: 'IBM Plex Mono', monospace;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.25rem;
  }
  .metric { display: flex; flex-direction: column; gap: 0.3rem; }
  .metric-val {
    font-size: clamp(1.2rem, 2.5vw, 1.7rem);
    color: #bdffff;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    line-height: 1.1;
  }
  .metric-val.cyan  { color: #bdffff; }
  .metric-val.coral { color: #ff9b9b; }
  .mu {
    font-size: 0.6rem;
    color: #4a4a5a;
    margin-left: 0.25rem;
    font-weight: 400;
  }
  .metric-lbl {
    font-size: 0.5rem;
    letter-spacing: 2px;
    color: #383848;
    font-family: 'IBM Plex Mono', monospace;
    text-transform: uppercase;
  }
  .metric-cmp {
    font-size: 0.65rem;
    color: #484858;
    font-family: 'Space Grotesk', sans-serif;
  }

  .vs-bar {
    border-top: 1px solid rgba(189,255,255,0.06);
    padding-top: 1.25rem;
    font-size: 0.8rem;
    color: #484858;
    font-family: 'Space Grotesk', sans-serif;
    line-height: 1.65;
  }
  .vs-bar strong { color: #bdffff; }

  /* ── Line chart ───────────────────────────────────────────────── */
  .lc-wrap {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.7s ease 0.18s, transform 0.7s ease 0.18s;
  }
  .lc-wrap.in { opacity: 1; transform: translateY(0); }
  .line-svg { overflow: visible; }
  .q-lbl { font-size: 9px; fill: #383848; }
  .peak-lbl { fill: #ff9b9b; font-size: 9.5px; font-family: 'IBM Plex Mono', monospace; }

  /* ── CTA section ──────────────────────────────────────────────── */
  .cta-ns { gap: 3rem; }
  .cta-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    opacity: 0;
    transform: translateY(14px);
    transition: opacity 0.6s ease 0.45s, transform 0.6s ease 0.45s;
  }
  .cta-row.in { opacity: 1; transform: translateY(0); }

  .cta-btn {
    background: none;
    border: 1px solid rgba(189,255,255,0.3);
    color: #bdffff;
    padding: 0.85rem 2.25rem;
    text-decoration: none;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 1px;
    border-radius: 7px;
    transition: background 0.25s, box-shadow 0.25s, border-color 0.25s;
    cursor: pointer;
  }
  .cta-btn:hover {
    background: rgba(189,255,255,0.06);
    box-shadow: 0 0 22px rgba(189,255,255,0.14);
    border-color: rgba(189,255,255,0.55);
  }
  .cta-sec {
    border-color: rgba(255,155,155,0.25);
    color: #ff9b9b;
  }
  .cta-sec:hover {
    background: rgba(255,155,155,0.06);
    box-shadow: 0 0 22px rgba(255,155,155,0.14);
    border-color: rgba(255,155,155,0.5);
  }

  /* ── Mobile ───────────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .page { padding: 5rem 1.25rem 7rem; gap: 6rem; }
    h1 { font-size: 2.3rem; }
    .live-row { flex-direction: column; gap: 1.5rem; }
    .live-sep { display: none; }
    .metrics { grid-template-columns: 1fr 1fr; }
    .callout-row { flex-direction: column; }
    .fact-strip { grid-template-columns: 1fr; }
    .hb-co { width: 64px; font-size: 0.55rem; }
    .calc { padding: 1.5rem; }
  }
</style>
