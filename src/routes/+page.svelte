<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores'; 
  import { fade, fly } from 'svelte/transition';
  import Map from '../components/Map.svelte';
  import datacenterData from '../data/datacenter.json';

  import rawVegaData from '../data/gpt_query_data.json';
  const datasets = (rawVegaData as any).datasets;
  const datasetKey = Object.keys(datasets)[0];
  const queryData = datasets[datasetKey].map((d: any) => ({
    date: d.Month_Label,
    val: d.Queries_Billions,
    index: d.Month_Index
  }));

  interface DCProperties {
    name?: string;
    operator?: string;
    website?: string;
    'building:levels'?: string;
    'addr:city'?: string;
    'addr:state'?: string;
    [key: string]: any;
  }
  interface DataCenterFeature {
    properties: DCProperties;
    geometry: { coordinates: [number, number] };
    id?: string | number;
  }

  let isStarted = $state(false);
  let showInstructions = $state(false); // ADDED: instruction modal shown once after START
  // svelte-ignore non_reactive_update
  let showStory = $state(false);
  let activeIndex = $state(0);
  let searchQuery = $state("");
  let selectedFeature = $state<DataCenterFeature | null>(null);
  let queryIndex = $state(queryData.length - 1);
  let currentQueries = $derived(queryData[queryIndex].val.toFixed(1));
  let currentDate = $derived(queryData[queryIndex].date);
  let isSatellite = $state(false);
  let lightboxImage = $state<string | null>(null);
  let lightboxLabel = $state('');
  // ── Footprint tracker state ──
  let footprintMode    = $state(false);
  let userMarkerCoords = $state<[number, number] | null>(null);
  let connectedIds     = $state<Set<string>>(new Set());
  let allExhausted     = $state(false);
  let connectionCount  = $derived(connectedIds.size);
  let pendingCoords    = $state<[number, number] | null>(null);
  let showMobileSidebar = $state(false);
  // svelte-ignore non_reactive_update
  let mapActions: {
    drawLineToDC: (u: [number, number], dc: any) => void;
    clearLines: () => void;
    clearPending: () => void;
  } | undefined;

  onMount(() => {
    const params = $page.url.searchParams;
    if (params.get('start') === 'true') {
      isStarted = true;
      showStory = true;
      const step = params.get('step');
      if (step) activeIndex = parseInt(step);
    }
  });

  const STATE_NAME_TO_ABBR: Record<string, string> = {
    "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA",
    "Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA",
    "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA",
    "Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD",
    "Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO",
    "Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ",
    "New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH",
    "Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC",
    "South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT",
    "Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY",
    "District of Columbia":"DC"
  };

  let selectedState = $state<string | null>(null);

  const rawFeatures: DataCenterFeature[] = (datacenterData as any).features || [];
  // FIXED: add _idx to every feature so we have a guaranteed unique ID
  // even when multiple facilities share the same name
  const datacenters = rawFeatures.map((f, i) => {
    const op = f.properties.operator || 'Independent Business';
    const name = f.properties.name || (f.properties as any).alt_name || op;
    return { ...f, properties: { ...f.properties, name, operator: op, _idx: String(i) } };
  });

  let filteredDatacenters = $derived(
    datacenters.filter(dc => {
      const term = searchQuery.toLowerCase();
      if (!dc.properties.name!.toLowerCase().includes(term) &&
          !dc.properties.operator!.toLowerCase().includes(term)) return false;
      if (selectedState) {
        const abbr = STATE_NAME_TO_ABBR[selectedState];
        if (abbr && dc.properties['addr:state'] !== abbr) return false;
      }
      return true;
    })
  );

  interface StoryStep {
    id: number;
    title: string;
    center: [number, number];
    zoom: number;
    pitch: number;
    description?: string;
    image?: string;
    imageLabel?: string;
  }

  const storyData: StoryStep[] = [
    { id: 0, title: "The Urgency",
      description: "AI feels invisible, but it is anchored in the physical: data centers, cooling systems, and strained power grids. As a designer and a user, I feel the urgency of this hidden footprint. We cannot let innovation ignore the environment. My goal is to move these spaces from hidden shadows to transparent, responsible designs that reduce harm rather than fueling endless expansion.",
      center: [-77.4874, 39.0438], zoom: 9, pitch: 45 },
    
    { id: 1, title: "Google Data Center",
      image: "/google-datacenter.jpg",
      imageLabel: "Google Data Center in Oregon",
      description: "As of 2026, Google maintains 26 hyperscale campuses across the U.S. A single facility can consume over 100 megawatts—equivalent to powering 80,000 homes. To cool this heat, millions of gallons of water are used daily. While efficiency (1.10 PUE) is high, the physical demand on local resources remains a massive design challenge for the future.",
      center: [-121.2012021, 45.6320147], zoom: 13.5, pitch: 60 },

    { id: 2, title: "The Digital Footprint",
      description: "A single SMS costs only 2KB of data and 0.014g of CO2. An AI response is 50x heavier, costing up to 100KB and 1.0g of CO2. While 10 texts a day produces 0.05kg of CO2 yearly, just 10 AI queries a day produces 1.8kg—the weight of nearly 400 balloons filled with CO2.",
      center: [-119.4179, 36.7783], zoom: 5.5, pitch: 45 },
    
    { id: 3, 
      title: "The Cloud Waste",
      image: "/aws.jpg",
      imageLabel: "AWS Data Center Interior",
      description: "To understand the invisible side of digital waste, we must look at the infrastructure that keeps the internet alive. Every email sent, video streamed, and AI prompt generated requires physical action. The IT industry's carbon footprint now rivals global aviation, fueled by 'dark data' and physical e-waste. This growing digital cloud demands hyperscale data centers that consume tremendous amounts of electricity and water. <br><br><a href='https://ourworld.unu.edu/en/a-growing-digital-waste-cloud' target='_blank' rel='noopener noreferrer' style='color: #172eff; text-decoration: underline; font-weight: bold; font-family: Space Grotesk, sans-serif'>Read the UNU Analysis on Digital Waste ↗</a>",
      center: [-122.34, 47.62], 
      zoom: 15, 
      pitch: 50 },

    { id: 4, title: "The Environmental Impact",
      image: "/collage 1.png",
      imageLabel: "Environmental Impact Collage",
      description: "Hidden in the forests of Oregon, a single campus consumes 100+ megawatts—enough to power 80,000 homes. Daily, 1,000,000 gallons of water vanish into cooling systems. This 'Red Fog' visualizes the invisible thermal load and resource extraction required to keep our digital world alive. Innovation must become transparently sustainable.",
      center: [-121.82, 37.82], zoom: 8, pitch: 65 },
   
    { id: 5, title: "Gilroy community fights against Amazon from constructing data center",
      image: "/gilroy-protest.jpg",
      imageLabel: "Amazon Data Center",
      description: "In Gilroy, California, a community of 60,000 residents is fighting against Amazon's plan to build a data center that would consume 50 megawatts of power and 360,000 gallons of water daily. This grassroots movement highlights the ethical responsibility of tech companies to consider the environmental and social impacts of their infrastructure on local communities. <br><br><a href='https://www.indybay.org/newsitems/2026/01/09/18882659.php' target='_blank' rel='noopener noreferrer' style='color: #172eff; text-decoration: underline; font-weight: bold; font-family: Space Grotesk, sans-serif'>Read more on the community movement↗</a>",
      center: [-121.559192, 37.017525], zoom: 15, pitch: 50 },
    
    { id: 6, title: "The institutions",
      image: "/nvidia-ceo.jpg",
      imageLabel: "NVIDIA CEO Jensen Huang",
      description: "Nvidia is the leading supplier of GPUs, the critical hardware for AI processing. In 2023, Nvidia's data center revenue surpassed $10 billion, reflecting the skyrocketing demand for AI. However, this growth comes with environmental costs, as GPU manufacturing is energy-intensive and relies on rare earth minerals. As consumers and designers, we must hold these institutions accountable for sustainable practices.",
      center: [-121.9674, 37.3708], zoom: 16, pitch: 50 }
  ];

  const maxSlide = storyData.length - 1;

  // ── Every named action charges the battery ───────────────────────────────
  function handleStart()  { isStarted = true; showInstructions = true; } // CHANGED: show instructions before story
  // ADDED: dismiss instruction modal and start the story
  function dismissInstructions() { showInstructions = false; showStory = true; connectOnButtonPress(); }
  function handleSkip()   { showStory = false; connectOnButtonPress(); }
  function handleNext()   { if (activeIndex < maxSlide) { activeIndex++; } else { activeIndex = 0; } connectOnButtonPress(); }
  function handlePrev()   { if (activeIndex > 0) activeIndex--; connectOnButtonPress(); }
  function toggleStyle()  { isSatellite = !isSatellite; connectOnButtonPress(); }

  // Extracted helpers so both the list AND the reset button charge the battery
  function selectFacility(dc: DataCenterFeature) {
    selectedFeature = dc;
    showStory = false;
    showMobileSidebar = false;
    connectOnButtonPress();
  }
  function resetView()   { selectedFeature = null; connectOnButtonPress(); }
  function reopenStory() { showStory = true; connectOnButtonPress(); }
  function clearSearch() { searchQuery = ""; connectOnButtonPress(); }

  function handleStateClick(stateName: string) {
    selectedState = selectedState === stateName ? null : stateName;
    selectedFeature = null;
    showStory = false;
  }
  function clearStateFilter() { selectedState = null; }

  // ── Footprint tracker functions ──
  // Flow: SET LOCATION → click map → preview → CONFIRM → mode stays ON → buttons draw lines
  // EXIT TRACKER turns off mode but keeps pin + lines intact
  // Re-entering SET LOCATION skips pin drop if pin already exists
  // RESET wipes everything
  function toggleFootprintMode() {
    footprintMode = !footprintMode;
    if (!footprintMode) {
      // Exiting: only clear unconfirmed preview — pin and lines survive
      pendingCoords = null;
      mapActions?.clearPending();
    }
    // Re-entering with an existing pin skips straight to draw mode (no re-drop)
  }

  function handleMapClick(coords: [number, number]) {
    // Only accept click if tracker is active AND no pin is confirmed or previewing yet
    if (!footprintMode || userMarkerCoords || pendingCoords) return;
    pendingCoords = coords;
  }

  function confirmLocation() {
    if (!pendingCoords) return;
    userMarkerCoords = pendingCoords;
    pendingCoords = null;
    // footprintMode stays ON — HUD flips to "EXIT TRACKER", buttons draw lines immediately
  }

  function cancelPending() {
    pendingCoords = null;
    mapActions?.clearPending();
  }

  // FIXED: use _idx (guaranteed unique per feature) instead of name to track connections
  // name-based tracking capped at ~934 because many facilities share the same name
  let _pendingIds = new Set<string>();

  function pickUnconnectedDC() {
    const pool = datacenters.filter(dc => {
      const idx = dc.properties._idx;
      return !connectedIds.has(idx) && !_pendingIds.has(idx);
    });
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  function connectOnButtonPress() {
    // Only draw when tracker is active AND pin is confirmed
    if (!footprintMode || allExhausted || !userMarkerCoords) return;
    const dc = pickUnconnectedDC();
    if (!dc) { allExhausted = true; return; }
    // Mark as pending immediately so the next rapid call won't pick the same DC
    _pendingIds.add(dc.properties._idx);
    mapActions?.drawLineToDC(userMarkerCoords, dc);
  }

  function handleLineDrawn(dcId: string) {
    _pendingIds.delete(dcId); // move from pending to confirmed
    connectedIds = new Set([...connectedIds, dcId]);
    if (connectedIds.size >= datacenters.length) allExhausted = true;
  }

  function resetFootprint() {
    mapActions?.clearLines();
    mapActions?.clearPending();
    connectedIds = new Set();
    _pendingIds = new Set(); // FIXED: also clear pending dispatch queue on reset
    allExhausted = false;
    userMarkerCoords = null;
    pendingCoords = null;
  }

  // ADDED: hold spacebar to continuously draw connections — gets faster the longer it's held
  // Starts at 400ms interval, accelerates every 600ms down to a minimum of 60ms
  // svelte-ignore non_reactive_update
  let _arrowInterval: ReturnType<typeof setInterval> | null = null;
  let _accelTimeout: ReturnType<typeof setTimeout> | null = null;
  let _holdStart: number = 0;

  function scheduleInterval(delay: number) {
    if (_arrowInterval) clearInterval(_arrowInterval);
    _arrowInterval = setInterval(() => {
      if (allExhausted || !userMarkerCoords) {
        stopSpacebar();
        return;
      }
      connectOnButtonPress();

      // Recalculate delay based on how long spacebar has been held
      // Every 600ms of hold time, cut the interval delay in half, floor at 60ms
      const held = Date.now() - _holdStart;
      const steps = Math.floor(held / 400);
      const newDelay = Math.max(30, Math.round(400 / Math.pow(2, steps)));
      if (newDelay !== delay) scheduleInterval(newDelay);
    }, delay);
  }

  function stopSpacebar() {
    if (_arrowInterval) { clearInterval(_arrowInterval); _arrowInterval = null; }
    if (_accelTimeout)  { clearTimeout(_accelTimeout);  _accelTimeout  = null; }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { lightboxImage = null; return; }
    if (e.key !== ' ') return;
    if (!footprintMode || allExhausted || !userMarkerCoords) return;
    if (_arrowInterval) return; // already running
    e.preventDefault();
    _holdStart = Date.now();
    connectOnButtonPress(); // fire once immediately on press
    scheduleInterval(400);  // start slow, acceleration handled inside interval
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.key !== ' ') return;
    stopSpacebar();
  }
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- CHANGED: added onConfirm and onCancel props passed to Map -->
<Map
  bind:actions={mapActions}
  {activeIndex}
  {isSatellite}
  {storyData}
  {selectedFeature}
  {showStory}
  {userMarkerCoords}
  {pendingCoords}
  onSelect={(dc) => { selectedFeature = dc; showStory = false; connectOnButtonPress(); }}
  onMapClick={handleMapClick}
  onLineDrawn={handleLineDrawn}
  onConfirm={confirmLocation}
  onCancel={cancelPending}
  {selectedState}
  onStateClick={handleStateClick}
/>

{#if !isStarted}
  <div class="landing-screen" out:fade={{ duration: 800 }}>
    <div class="card">
      <h1>THE INVISIBLE OCCUPANTS</h1>
      <p>Mapping the invisible infrastructure of AI</p>
      <button class="start-btn" onclick={handleStart}>START PROJECT</button>
    </div>
  </div>
{/if}

{#if showInstructions}
  <!-- ADDED: instruction overlay shown once after START, before the main UI -->
  <div class="instruction-overlay" in:fade={{ duration: 400 }} out:fade={{ duration: 300 }}>
    <div class="instruction-box">
      <div class="instruction-header">
        <span class="instruction-tag">HOW TO USE</span>
        <button class="instruction-close" onclick={dismissInstructions}>✕</button>
      </div>

      <h2>Footprint Tracker</h2>
      <p class="instruction-lead">Map your digital footprint across every data center in the U.S.</p>

      <div class="instruction-steps">
        <div class="instruction-step">
          <div class="step-num">01</div>
          <div class="step-body">
            <span class="step-title">SET YOUR LOCATION</span>
            <span class="step-desc">Click <strong>⊕ SET LOCATION</strong> in the top bar, then click anywhere on the map to drop your pin.</span>
          </div>
        </div>
        <div class="instruction-step">
          <div class="step-num">02</div>
          <div class="step-body">
            <span class="step-title">CONFIRM THE PIN</span>
            <span class="step-desc">A yellow preview dot appears. Hit <strong>✓ CONFIRM</strong> on the popup to lock your location.</span>
          </div>
        </div>
        <div class="instruction-step">
          <div class="step-num">03</div>
          <div class="step-body">
            <span class="step-title">DRAW CONNECTIONS</span>
            <span class="step-desc">Press any nav button — or hold <kbd>SPACE</kbd> — to draw connetion lines to data centers. The longer you hold, the faster it connects.</span>
          </div>
        </div>
        <div class="instruction-step">
          <div class="step-num">04</div>
          <div class="step-body">
            <span class="step-title">TRACK YOUR REACH</span>
            <span class="step-desc">Watch the <strong>FOOTPRINT TRACKER</strong> panel grow. See how much of {datacenters.length} facilities can you reach unintentionally or intentionally.</span>
          </div>
        </div>
      </div>

      <button class="instruction-cta" onclick={dismissInstructions}>GOT IT — START EXPLORING →</button>
    </div>
  </div>
{/if}

{#if isStarted}
  <main class="ui-container">

    <!-- Mobile sidebar toggle -->
    <button class="mobile-list-btn" onclick={() => showMobileSidebar = !showMobileSidebar}>
      {showMobileSidebar ? '✕' : '☰ LIST'}
    </button>

    <!-- Mobile sidebar backdrop -->
    {#if showMobileSidebar}
      <div class="mobile-backdrop" onclick={() => showMobileSidebar = false}></div>
    {/if}

    <!-- Footprint tracker toggle button -->
    <div class="footprint-controls">
      <button class="footprint-btn" class:active={footprintMode} onclick={toggleFootprintMode}>
        {footprintMode ? '✕ EXIT' : '⊕ TRACK'}
      </button>
    </div>

    <!-- CHANGED: removed pendingCoords from HUD visibility condition — popup is now on the marker itself -->
    {#if footprintMode || connectionCount > 0}
      <div class="footprint-hud" transition:fade>
        <div class="hud-header">
          <span class="hud-title">FOOTPRINT TRACKER</span>
          {#if connectionCount > 0}
            <button class="hud-reset" onclick={resetFootprint}>RESET</button>
          {/if}
        </div>
        <div class="hud-stat">
          <span class="hud-num">{connectionCount}</span>
          <span class="hud-label"> / {datacenters.length} reached</span>
        </div>

        <!-- Desktop: spacebar hint. Mobile: tap-to-connect button -->
        {#if footprintMode && userMarkerCoords && !allExhausted}
          <div class="hud-key-hint">
            <div class="key-icon" class:active={_arrowInterval !== null}>␣</div>
            <span class="hud-hint" style="margin:0">Hold to connect</span>
          </div>
          <button class="mobile-connect-btn" onclick={connectOnButtonPress}>+ CONNECT</button>
        {/if}

        <!-- CHANGED: removed the confirm-row block — confirm/cancel is now attached to the map marker -->

        {#if allExhausted}
          <p class="hud-done">All data centers connected.</p>
        {:else if !userMarkerCoords && footprintMode}
          <p class="hud-hint">Click the map to drop your location pin.</p>
        {:else if footprintMode}
          <p class="hud-hint">Press any button to draw a connection.</p>
        {/if}

        <div class="hud-bar-track">
          <div class="hud-bar-fill" style="width:{datacenters.length > 0 ? (connectionCount/datacenters.length)*100 : 0}%"></div>
        </div>
      </div>
    {/if}

    <div class="top-controls">
      <button class="style-toggle" onclick={toggleStyle}>
        {isSatellite ? 'SWITCH TO DARK' : 'SWITCH TO SATELLITE'}
      </button>
    </div>

    <aside class="sidebar" class:mobile-open={showMobileSidebar}>
      <header>
        <div class="sidebar-header-row">
          <h3>Infrastructure Explorer</h3>
          <button class="sidebar-close-btn" onclick={() => showMobileSidebar = false}>✕</button>
        </div>
        <p class="subtitle">Search the physical cloud</p>
      </header>

      <div class="search-box">
        <input type="text" placeholder="Search by name or operator..." bind:value={searchQuery} />
        {#if searchQuery}
          <button class="clear-search" onclick={clearSearch}>✕</button>
        {/if}
      </div>

      {#if !showStory}
        <button class="reopen-btn" onclick={reopenStory}>Return to Story</button>
      {/if}

      {#if selectedState}
        <div class="state-filter-badge" transition:fade>
          <div class="sf-info">
            <span class="sf-label">STATE FILTER</span>
            <span class="sf-name">{selectedState}</span>
          </div>
          <button class="sf-clear" onclick={clearStateFilter}>✕ CLEAR</button>
        </div>
      {/if}

      <p class="count-label">Showing {filteredDatacenters.length} facilities{selectedState ? ` in ${STATE_NAME_TO_ABBR[selectedState] || selectedState}` : ''}</p>

      <div class="list">
        {#each filteredDatacenters as dc}
          <button
            class:active={selectedFeature?.properties.name === dc.properties.name}
            onclick={() => selectFacility(dc)}
          >
            {dc.properties.name}
          </button>
        {/each}
      </div>

      {#if selectedFeature}
        <div class="dc-info" transition:fade>
          <h4>{selectedFeature.properties.name}</h4>
          <p><strong>Operator:</strong> {selectedFeature.properties.operator}</p>
          <p><strong>City:</strong> {selectedFeature.properties['addr:city'] || 'Unknown'}</p>
          {#if selectedFeature.properties.website}
            <p><strong>Status:</strong>
              <a href={selectedFeature.properties.website} target="_blank" rel="noopener noreferrer" class="site-link">
                Official Website ↗
              </a>
            </p>
          {:else}
            <p><strong>Status:</strong> Critical Infrastructure</p>
          {/if}
          <button class="reset-btn" onclick={resetView}>RESET VIEW</button>
        </div>
      {/if}
    </aside>

    {#if showStory}
      <div class="story-layout">
        {#key activeIndex}
          <section class="story-box" in:fly={{ y: 20, duration: 400 }}>
            <div class="story-top-bar">
              <button class="skip-btn" onclick={handleSkip}>✕ SKIP STORY</button>
            </div>

            {#if activeIndex === 0}
              <div class="query-viz-container" in:fade>
                <div class="viz-header">
                  <div class="stat-unit">
                    <span class="viz-label">ESTIMATED VOLUME</span>
                    <span class="viz-value">{currentQueries}B <small>Queries/mo</small></span>
                  </div>
                  <div class="stat-unit align-right">
                    <span class="viz-label">TIMELINE</span>
                    <span class="viz-value">{currentDate}</span>
                  </div>
                </div>
                <div class="query-bars">
                  {#each queryData as item, i}
                    <div
                      class="q-bar"
                      style="height: {(item.val / 82) * 100}%;"
                      class:active={i <= queryIndex}>
                    </div>
                  {/each}
                </div>
                <input
                  type="range"
                  min="0"
                  max={queryData.length - 1}
                  bind:value={queryIndex}
                  class="timeline-slider"
                />
                <p class="timeline-hint">Drag to trace the impact from debut to 2026</p>
              </div>
            {/if}

            {#if storyData[activeIndex].image}
              <div class="image-container" in:fade>
                <img
                  src={storyData[activeIndex].image}
                  alt="Site Visual"
                  class="expandable-img"
                  onclick={() => {
                    lightboxImage = storyData[activeIndex].image!;
                    lightboxLabel = storyData[activeIndex].imageLabel || '';
                  }}
                />
                <span class="image-label">{storyData[activeIndex].imageLabel || ""}</span>
                <span class="expand-hint">⤢ click to expand</span>
              </div>
            {/if}

            <h1>{storyData[activeIndex].title}</h1>
            <p>{@html storyData[activeIndex].description}</p>

            {#if storyData[activeIndex].id === 2}
              <a
                class="story-link story-link--impact"
                href="/digital-footprint"
                data-sveltekit-reload
              >
                Explore the Sequence Diagram<span class="arrow">→</span>
              </a>
            {/if}

            {#if storyData[activeIndex].id === 4}
              <a
                class="story-link story-link--impact"
                href="/invisible-weight"
                data-sveltekit-reload
              >
                The Invisible Weight<span class="arrow">→</span>
              </a>
            {/if}
          </section>
        {/key}

      </div>

      <!-- Moved outside story-layout: CSS transform on parent traps fixed children -->
      <footer class="nav-bar" in:fade>
        <button class="nav-btn" onclick={handlePrev} disabled={activeIndex === 0}>BACK</button>
        <div class="counter"><span>{activeIndex + 1}</span> / {storyData.length}</div>
        <button class="nav-btn" onclick={handleNext}>{activeIndex === maxSlide ? 'RETURN TO BEGINNING' : 'NEXT'}</button>
      </footer>
    {/if}

  </main>

  <!-- Lightbox overlay — rendered outside .ui-container so pointer-events work correctly -->
  {#if lightboxImage}
    <div
      class="lightbox-backdrop"
      onclick={() => lightboxImage = null}
      onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { lightboxImage = null; e.preventDefault(); } }}
      role="button"
      tabindex="0"
      aria-label="Close lightbox"
      in:fade={{ duration: 180 }}
      out:fade={{ duration: 150 }}
    >
      <div class="lightbox-frame" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); } }} role="dialog" tabindex="0">
        <button class="lightbox-close" onclick={() => lightboxImage = null} aria-label="Close">✕</button>
        <img src={lightboxImage} alt="Enlarged view" />
        {#if lightboxLabel}
          <span class="lightbox-caption">{lightboxLabel}</span>
        {/if}
      </div>
    </div>
  {/if}
{/if}

<style>
  :global(body) { margin: 0; overflow: hidden; background: #000; font-family: "Corpta", monospace; }

  .ui-container { position: relative; z-index: 10; pointer-events: none; height: 100vh; }
  .sidebar, .story-box, .nav-bar { pointer-events: auto; }

  .landing-screen {
    position: fixed; top: 40px; left: 0; right: 0; bottom: 0; z-index: 100;
    background: radial-gradient(circle at center, rgba(15, 0, 30, 0.7) 0%, #000 100%);
    display: flex; align-items: center; justify-content: center;
  }
  .card { text-align: center; color: #bdffff; }
  .card h1 { font-size: 3rem; letter-spacing: 0.3em; margin-bottom: 0.5rem; }
  .start-btn { background: none; border: 2px solid #bdffff; color: #bdffff; padding: 1rem 2rem; cursor: pointer; font-weight: bold; margin-top: 2rem; transition: 0.3s; }
  .start-btn:hover { background: #bdffff; color: #000; box-shadow: 0 0 20px rgba(189, 255, 255, 0.5); }

  .sidebar {
    position: fixed; top: calc(40px + 1.25rem); left: 2rem; width: 320px;
    background: rgba(10, 10, 10, 0.85); backdrop-filter: blur(15px);
    padding: 1.5rem; border-radius: 16px; color: white; border: 1px solid #333;
    font-family: 'Space Grotesk', sans-serif;
    max-height: 60vh; overflow-y: auto;
  }
  .subtitle { font-size: 0.75rem; opacity: 0.6; margin-bottom: 1.5rem; }
  .search-box { position: relative; }
  .search-box input { width: 100%; box-sizing: border-box; background: #1a1a1a; border: 1px solid #444; color: white; padding: 0.7rem 1rem; border-radius: 8px; font-size: 0.85rem; outline: none; }
  .clear-search { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #666; cursor: pointer; }
  .count-label { font-size: 0.65rem; color: #888; margin: 0.8rem 0; text-transform: uppercase; }
  .list { max-height: 200px; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 5px; }
  .list button { background: #222; border: 1px solid #333; color: #aaa; padding: 5px 8px; font-size: 0.7rem; cursor: pointer; border-radius: 4px; }
  .list button.active { background: #ff9b9b; color: #000; border-color: #ff9b9b; font-weight: bold; }
  .reopen-btn { width: 100%; background: rgba(0,0,0,0.8); color: #bdffff; border: 1px solid #333; padding: 0.6rem 1.2rem; border-radius: 30px; cursor: pointer; font-family: 'Space Grotesk', sans-serif; font-size: 0.7rem; font-weight: bold; transition: 0.3s; backdrop-filter: blur(10px); margin: 0.3rem 0; box-sizing: border-box; }
  .reopen-btn:hover { border-color: #bdbfff; box-shadow: 0 0 15px rgba(189,255,255,0.3); }

  .state-filter-badge {
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(189,255,255,0.07); border: 1px solid rgba(189,255,255,0.3);
    border-radius: 8px; padding: 0.45rem 0.75rem; margin: 0.4rem 0 0.2rem;
  }
  .sf-info { display: flex; flex-direction: column; gap: 1px; }
  .sf-label { font-size: 0.45rem; color: rgba(189,255,255,0.5); letter-spacing: 2px; font-family: 'Corpta', monospace; }
  .sf-name { font-size: 0.68rem; color: #bdffff; font-family: 'Corpta', monospace; }
  .sf-clear { background: none; border: none; color: #ff9b9b; font-size: 0.55rem; cursor: pointer; padding: 0; font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.5px; }
  .sf-clear:hover { text-decoration: underline; }

  /* Sidebar header row with close button */
  .sidebar-header-row { display: flex; align-items: flex-start; justify-content: space-between; }
  .sidebar-close-btn {
    display: none; /* hidden on desktop */
    background: none; border: none; color: #666; cursor: pointer;
    font-size: 1rem; padding: 0; line-height: 1; flex-shrink: 0;
    transition: color 0.2s;
  }
  .sidebar-close-btn:hover { color: #ff9b9b; }

  .dc-info { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #333; }
  .dc-info h4 { color: #ff9b9b; margin: 0 0 0.5rem 0; }
  .dc-info p { font-size: 0.75rem; margin: 0.3rem 0; color: #ccc; }
  .site-link { color: #bdffff; text-decoration: underline; text-underline-offset: 3px; font-weight: bold; }
  .reset-btn { background: none; border: none; color: #ff9b9b; cursor: pointer; font-size: 0.7rem; padding: 0; margin-top: 0.8rem; text-decoration: underline; }

  /* Story box mirrors the sidebar: same top, same edge distance, just on the right */
  .story-layout { position: fixed; top: calc(40px + 1.25rem); right: 2rem; pointer-events: auto; z-index: 10; }
  .story-box { background: #f9f4fff2; padding: 2.5rem; border-radius: 16px; width: 400px; position: relative; box-shadow: 0 30px 60px rgba(0,0,0,0.6); max-height: 60vh; overflow-y: auto; }
  .story-box h1 { margin-top: 0; color: #333; font-size: 1.8rem; }
  .story-box p { color: #444; line-height: 1.6; font-family: 'Space Grotesk', sans-serif; }
  .story-top-bar { display: flex; justify-content: flex-end; margin-bottom: 0.75rem; }
  .skip-btn { background: none; border: none; font-size: 0.7rem; color: #999; cursor: pointer; padding: 0; }

  .query-viz-container {
    background: rgba(10, 10, 10, 0.95);
    padding: 1.25rem; border-radius: 12px; border: 1px solid #333;
    margin-bottom: 1.5rem; font-family: 'Space Grotesk', sans-serif;
  }
  .viz-header { display: flex; justify-content: space-between; margin-bottom: 1rem; }
  .stat-unit .viz-label { font-size: 0.55rem; color: #777; letter-spacing: 1px; display: block; }
  .stat-unit .viz-value { font-size: 1.1rem; color: #ff9b9b; font-weight: bold; }
  .stat-unit small { font-size: 0.6rem; color: #555; font-weight: normal; }
  .align-right { text-align: right; }
  .query-bars { height: 70px; display: flex; align-items: flex-end; gap: 2px; margin-bottom: 1rem; }
  .q-bar { flex: 1; background: #1a1a1a; border-radius: 1px 1px 0 0; transition: background 0.1s ease; }
  .q-bar.active { background: #ff5f5f; box-shadow: 0 0 8px rgba(255, 95, 95, 0.15); }
  .timeline-slider { width: 100%; accent-color: #ff5f5f; cursor: grab; margin: 0; }
  .timeline-hint { font-size: 0.5rem; color: #444; text-align: center; margin-top: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px; }

  .nav-bar {
    position: fixed; bottom: 3rem; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 2rem;
    background: rgba(10, 10, 10, 0.9); padding: 0.8rem 2rem; border-radius: 50px; border: 1px solid #333; color: white;
  }
  .nav-btn { background: #f9f4fff2; border: none; color: black; padding: 0.6rem 1.5rem; border-radius: 20px; font-weight: bold; cursor: pointer; }
  .nav-btn:disabled { opacity: 0.3; background: #333; color: #888; }
  .counter span { color: #ff9b9b; }

  .image-container { width: 100%; margin-bottom: 1.5rem; position: relative; border-radius: 8px; overflow: hidden; border: 1px solid rgba(0, 0, 0, 0.1); }
  .image-container img { width: 100%; height: 300px; object-fit: cover; display: block; filter: saturate(1.2) contrast(1.1); }
  .image-label { position: absolute; bottom: 10px; left: 10px; background: rgba(0, 0, 0, 0.7); color: #bdffff; padding: 4px 8px; font-size: 0.6rem; font-family: 'Space Grotesk', sans-serif; text-transform: uppercase; }

  .expandable-img { cursor: zoom-in; transition: filter 0.2s, transform 0.2s; }
  .expandable-img:hover { filter: saturate(1.4) contrast(1.2) brightness(1.06); transform: scale(1.01); }
  .expand-hint {
    position: absolute; bottom: 10px; right: 10px;
    background: rgba(0, 0, 0, 0.65); color: rgba(189, 255, 255, 0.8);
    padding: 3px 7px; font-size: 0.55rem; font-family: 'Space Grotesk', sans-serif;
    text-transform: uppercase; letter-spacing: 1px; border-radius: 4px;
    opacity: 0; transition: opacity 0.2s; pointer-events: none;
  }
  .image-container:hover .expand-hint { opacity: 1; }

  /* ── Lightbox ─────────────────────────────────────── */
  .lightbox-backdrop {
    position: fixed; inset: 0; z-index: 600;
    background: rgba(0, 0, 0, 0.88);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    cursor: zoom-out;
    padding: 2rem;
  }
  .lightbox-frame {
    position: relative;
    max-width: min(90vw, 1100px);
    max-height: 85vh;
    border-radius: 12px;
    overflow: hidden;
    cursor: default;
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(189, 255, 255, 0.1);
    background: #0a0a0a;
  }
  .lightbox-frame img {
    display: block;
    max-width: 100%;
    max-height: 85vh;
    width: auto;
    height: auto;
    object-fit: contain;
    filter: saturate(1.15) contrast(1.05);
  }
  .lightbox-caption {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: rgba(0, 0, 0, 0.75);
    color: #bdffff; padding: 0.6rem 1rem;
    font-size: 0.6rem; font-family: 'Space Grotesk', sans-serif;
    text-transform: uppercase; letter-spacing: 1.5px;
  }
  .lightbox-close {
    position: absolute; top: 0.75rem; right: 0.75rem; z-index: 1;
    width: 30px; height: 30px; border-radius: 50%;
    background: rgba(0, 0, 0, 0.7); border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff; font-size: 0.8rem; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.2s, border-color 0.2s;
  }
  .lightbox-close:hover { background: rgba(255, 80, 80, 0.75); border-color: rgba(255, 100, 100, 0.5); }

  .story-link {
    display: inline-block; margin-top: 1.5rem; padding: 0.8rem 1.2rem;
    background: #ff9b9b; color: #000; text-decoration: none; font-weight: bold;
    font-family: 'Space Grotesk', sans-serif; border-radius: 4px;
    transition: all 0.3s ease; font-size: 0.8rem;
  }
  .story-link:hover { background: #ffc2c2; box-shadow: 0 0 15px rgba(255, 155, 155, 0.4); transform: translateY(-2px); }
  .story-link--impact { background: #050010; color: #bdffff; border: 1px solid #bdffff; }
  .story-link--impact:hover { background: #0d0028; box-shadow: 0 0 15px rgba(189, 255, 255, 0.3); }

  .top-controls {
    position: fixed; top: calc(40px + 1.25rem); left: 45%; transform: translateX(-50%);
    z-index: 20; pointer-events: auto;
  }
  .style-toggle {
    background: rgba(0, 0, 0, 0.8); color: #bdffff; border: 1px solid #333;
    padding: 0.6rem 1.2rem; border-radius: 30px; cursor: pointer;
    font-family: 'Corpta', monospace; font-size: 0.7rem; font-weight: bold;
    transition: 0.3s; backdrop-filter: blur(10px);
  }
  .style-toggle:hover { border-color: #bdffff; box-shadow: 0 0 15px rgba(189, 255, 255, 0.3); }

  .footprint-controls {
    position: fixed; top: calc(40px + 1.25rem); right: 40%; z-index: 20; pointer-events: auto;
  }
  .footprint-btn {
    background: rgba(0,0,0,0.8); color: #bdffff; border: 1px solid #333;
    padding: 0.6rem 1.2rem; border-radius: 30px; cursor: pointer;
    font-family: 'Corpta', monospace; font-size: 0.7rem; font-weight: bold;
    transition: 0.3s; backdrop-filter: blur(10px);
  }
  .footprint-btn:hover, .footprint-btn.active { border-color: #bdbfff; box-shadow: 0 0 15px rgba(189,255,255,0.3); }
  .footprint-hud {
    position: fixed; bottom: 5rem; left: 2rem; z-index: 20; pointer-events: auto;
    background: rgba(10,10,10,0.88); backdrop-filter: blur(14px);
    border: 1px solid #2a2a2a; border-radius: 14px;
    padding: 1rem 1.25rem; width: 220px;
    font-family: 'Space Grotesk', sans-serif; color: white;
  }
  .hud-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
  .hud-title { font-size: 0.55rem; letter-spacing: 2px; color: #bdffff; opacity: 0.7; font-family: 'Corpta', monospace; }
  .hud-reset { background: none; border: none; color: #ff9b9b; font-size: 0.55rem; font-family: 'Space Grotesk', sans-serif; cursor: pointer; padding: 0; text-decoration: underline; }
  .hud-stat { display: flex; align-items: baseline; gap: 2px; margin-bottom: 0.5rem; }
  .hud-num { font-size: 1.6rem; font-weight: bold; color: #bdffff; line-height: 1; font-family: 'Corpta', monospace; }
  .hud-label { font-size: 0.6rem; color: #888; font-family: 'Space Grotesk', sans-serif; }
  .hud-hint { font-size: 0.6rem; color: #666; margin: 0.4rem 0 0.6rem; line-height: 1.5; font-family: 'Space Grotesk', sans-serif; }
  .hud-done { font-size: 0.6rem; color: #6ecf6e; margin: 0.4rem 0 0.6rem; font-family: 'Space Grotesk', sans-serif; }
  .hud-bar-track { height: 3px; background: #1a1a1a; border-radius: 2px; overflow: hidden; }
  .hud-bar-fill { height: 100%; background: #bdffff; border-radius: 2px; transition: width 0.4s ease; }

  /* CHANGED: removed .confirm-btn and .cancel-btn — those styles now live in Map.svelte as .pending-confirm / .pending-cancel */

  /* ADDED: instruction overlay styles */
  .instruction-overlay {
    position: fixed; top: 40px; left: 0; right: 0; bottom: 0; z-index: 200;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 1rem;
  }
  .instruction-box {
    background: rgba(10,10,10,0.95); border: 1px solid #2a2a2a;
    border-radius: 18px; padding: 2rem 2.2rem; width: 100%; max-width: 480px;
    font-family: 'Space Grotesk', sans-serif; color: white;
    box-shadow: 0 0 60px rgba(189,255,255,0.08);
  }
  .instruction-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.4rem;
  }
  .instruction-tag {
    font-size: 0.5rem; letter-spacing: 3px; color: #bdffff; opacity: 0.6; font-family: 'Corpta', monospace;
  }
  .instruction-close {
    background: none; border: none; color: #555; cursor: pointer;
    font-size: 0.75rem; padding: 0; transition: color 0.2s;
  }
  .instruction-close:hover { color: #ff9b9b; }
  .instruction-box h2 {
    font-size: 1.5rem; font-weight: 500; color: #bdffff;
    margin: 0 0 0.4rem; letter-spacing: 0.05em; font-family: 'Corpta', monospace;
  }
  .instruction-lead {
    font-size: 0.72rem; color: #666; margin: 0 0 1.6rem; line-height: 1.6; font-family: 'Space Grotesk', sans-serif;
  }
  .instruction-steps { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.8rem; }
  .instruction-step {
    display: flex; gap: 1rem; align-items: flex-start;
    padding: 0.75rem 0.9rem; border-radius: 10px; background: rgba(255,255,255,0.03);
    border: 1px solid #1e1e1e;
  }
  .step-num {
    font-size: 0.6rem; color: #bdffff; opacity: 0.4; font-weight: 500;
    min-width: 20px; padding-top: 2px; font-family: 'Corpta', monospace;
  }
  .step-body { display: flex; flex-direction: column; gap: 0.25rem; }
  .step-title { font-size: 0.55rem; letter-spacing: 2px; color: #bdffff; font-weight: 500; font-family: 'Corpta', monospace; }
  .step-desc { font-size: 0.65rem; color: #666; line-height: 1.6; font-family: 'Space Grotesk', sans-serif; }
  .step-desc strong { color: #aaa; font-weight: 500; }
  kbd {
    display: inline-block; background: #1a1a1a; border: 1px solid #444;
    border-radius: 4px; padding: 0.1rem 0.35rem; font-size: 0.6rem;
    font-family: 'Corpta', monospace; color: #bdffff;
  }
  .instruction-cta {
    width: 100%; background: none; border: 1px solid #bdffff; color: #bdffff;
    padding: 0.85rem; border-radius: 8px; cursor: pointer;
    font-family: 'Corpta', monospace; font-size: 0.65rem; font-weight: 500;
    letter-spacing: 1px; transition: all 0.25s;
  }
  .instruction-cta:hover { background: #bdffff; color: #000; box-shadow: 0 0 20px rgba(189,255,255,0.25); }

  /* ADDED: up-arrow key hint inside the HUD */
  .hud-key-hint { display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0 0.6rem; }
  .key-icon {
    width: 32px; height: 22px; border-radius: 5px;
    background: #1a1a1a; border: 1px solid #444;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; color: #bdffff; flex-shrink: 0;
    transition: background 0.1s, border-color 0.1s;
  }
  .key-icon.active { background: #bdffff; color: #000; border-color: #bdffff; }

  /* Mobile-only connect button (hidden on desktop) */
  .mobile-connect-btn { display: none; }

  /* Mobile list toggle button (hidden on desktop) */
  .mobile-list-btn { display: none; }

  /* Mobile backdrop */
  .mobile-backdrop {
    display: none;
    position: fixed; inset: 0; z-index: 45;
    background: rgba(0,0,0,0.5);
  }

  /* ── Mobile layout ───────────────────────────────────────────────────── */
  @media (max-width: 768px) {

    /* ── Mobile list button ── */
    .mobile-list-btn {
      display: flex; align-items: center; gap: 0.35rem;
      position: fixed; top: calc(40px + 0.6rem); left: 0.75rem; z-index: 25;
      background: rgba(0,0,0,0.85); color: #bdffff; border: 1px solid #444;
      padding: 0.5rem 0.9rem; border-radius: 30px; cursor: pointer;
      font-family: 'Corpta', monospace; font-size: 0.65rem; font-weight: bold;
      backdrop-filter: blur(12px); pointer-events: auto;
      transition: border-color 0.2s, box-shadow 0.2s;
      white-space: nowrap;
    }

    /* ── Mobile backdrop ── */
    .mobile-backdrop { display: block; }

    /* ── Mobile connect button ── */
    .mobile-connect-btn {
      display: block;
      width: 100%; margin-top: 0.6rem;
      background: rgba(189,255,255,0.08); color: #bdffff;
      border: 1px solid rgba(189,255,255,0.4); border-radius: 8px;
      padding: 0.55rem; font-family: 'Corpta', monospace;
      font-size: 0.6rem; font-weight: bold; cursor: pointer;
      letter-spacing: 1px; transition: background 0.15s;
    }
    .mobile-connect-btn:active { background: rgba(189,255,255,0.2); }

    /* ── Landing screen ── */
    .card h1 { font-size: 1.6rem; letter-spacing: 0.12em; }
    .card p { font-size: 0.8rem; }
    .start-btn { padding: 0.75rem 1.5rem; font-size: 0.85rem; margin-top: 1.5rem; }

    /* ── Sidebar → LEFT slide-in drawer (no bottom conflict with story) ── */
    .sidebar {
      top: 40px !important;
      bottom: 0 !important;
      left: 0 !important;
      right: auto !important;
      width: min(82vw, 300px) !important;
      border-radius: 0 16px 16px 0 !important;
      max-height: calc(100vh - 40px) !important;
      overflow-y: auto;
      transform: translateX(-105%);
      transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 50;
      padding: 1.5rem 1.25rem 2.5rem !important;
    }
    .sidebar.mobile-open { transform: translateX(0); }

    /* Show close button inside sidebar on mobile */
    .sidebar-close-btn { display: block; }

    /* Prevent iOS font zoom on search input */
    .search-box input { font-size: 1rem; padding: 0.65rem 0.9rem; }
    .list { max-height: 38vh; }

    /* ── Story layout → anchored above fixed nav bar, scrollable ── */
    .story-layout {
      position: fixed !important;
      top: auto !important;
      bottom: 100px !important;        /* sits just above the fixed nav bar */
      left: 50% !important;
      right: auto !important;
      transform: translateX(-50%) !important;
      width: 92vw !important;
      max-width: 420px !important;
      max-height: 100vh !important;    /* cap height so map stays visible above */
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch;
      border-radius: 16px !important;
      z-index: 15;
      pointer-events: auto;
    }

    .story-box {
      width: 100% !important;
      box-sizing: border-box !important;
      border-radius: 16px !important;
      max-height: none !important;    /* no inner cap — parent handles scroll */
      overflow-y: visible !important;
      padding: 1.1rem 1.2rem 1.25rem !important;
      box-shadow: 0 -4px 40px rgba(0,0,0,0.55), 0 8px 40px rgba(0,0,0,0.4) !important;
    }

    /* Remove drag-handle pill */
    .story-box::before { display: none; }

    .story-box h1 { font-size: 1rem !important; margin: 0 0 0.5rem !important; padding-right: 2rem; line-height: 1.3; }
    .story-box p  { font-size: 0.73rem !important; line-height: 1.55 !important; margin: 0 0 0.4rem; }
    .skip-btn { font-size: 0.65rem !important; }

    /* Full images on mobile — scroll to see them */
    .image-container { display: block !important; margin-bottom: 0.75rem !important; }
    .image-container img { height: 200px !important; }
    .expand-hint { opacity: 1 !important; }

    /* Compact query viz */
    .query-viz-container { padding: 0.8rem !important; margin-bottom: 0.65rem !important; }
    .query-bars { height: 44px !important; }
    .viz-header { margin-bottom: 0.5rem !important; }
    .stat-unit .viz-value { font-size: 0.9rem !important; }

    /* Story link */
    .story-link { font-size: 0.7rem !important; padding: 0.55rem 0.85rem !important; margin-top: 0.4rem !important; }

    /* ── Nav bar → fixed at very bottom of screen ── */
    .nav-bar {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      transform: none !important;
      border-radius: 0 !important;
      width: 100% !important; box-sizing: border-box !important;
      justify-content: space-between !important;
      padding: 0.6rem 2rem !important;
      gap: 0 !important;
      border-top: 1px solid #2a2a2a !important;
      border-left: none !important; border-right: none !important; border-bottom: none !important;
      z-index: 20 !important;
    }
    .nav-btn { padding: 0.6rem 1.6rem !important; font-size: 0.75rem !important; min-height: 44px; }
    .counter { font-size: 0.75rem; }

    /* ── Map style toggle — centered at top ── */
    .top-controls {
      top: calc(40px + 0.6rem) !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
    }
    .style-toggle { font-size: 0.55rem !important; padding: 0.5rem 0.8rem !important; }

    /* ── Footprint controls — top right ── */
    .footprint-controls {
      top: calc(40px + 0.6rem) !important;
      right: 0.75rem !important;
      left: auto !important;
    }
    .footprint-btn { font-size: 0.55rem !important; padding: 0.5rem 0.8rem !important; }

    /* ── Footprint HUD — compact, below top row ── */
    .footprint-hud {
      bottom: auto !important;
      top: calc(40px + 3.5rem) !important;
      left: 0.75rem !important;
      width: 150px !important;
      padding: 0.7rem 0.85rem !important;
    }
    .hud-num { font-size: 1.2rem !important; }
    .hud-key-hint { display: none !important; }

    /* ── Instructions modal ── */
    .instruction-box {
      padding: 1.4rem 1.2rem 1.2rem !important;
      max-height: 88vh !important;
      overflow-y: auto;
    }
    .instruction-box h2  { font-size: 1.1rem !important; }
    .instruction-lead    { font-size: 0.7rem !important; margin-bottom: 1rem !important; }
    .instruction-steps   { gap: 0.6rem !important; margin-bottom: 1rem !important; }
    .instruction-step    { padding: 0.6rem 0.75rem !important; }
    .step-desc           { font-size: 0.62rem !important; }
    .instruction-cta     { padding: 0.7rem !important; font-size: 0.6rem !important; }
  }

  /* ── Extra-small phones (iPhone SE / older, < 390px) ── */
  @media (max-width: 390px) {
    .card h1 { font-size: 1.25rem; letter-spacing: 0.08em; }
    .story-layout { width: 96vw !important; }
    .story-box h1 { font-size: 0.88rem !important; }
    .image-container img { height: 160px !important; }
    .nav-btn { padding: 0.5rem 1.1rem !important; }
    .footprint-hud { width: 135px !important; }
  }
</style>