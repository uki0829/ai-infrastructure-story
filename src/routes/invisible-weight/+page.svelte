<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { PUBLIC_MAPBOX_TOKEN } from '$env/static/public';
  import rawVegaData from '../../data/gpt_query_data.json';
  import rawDCData from '../../data/datacenter.json';
  import rawCensusStates from '../../data/gz_2010_us_040_00_500k.json';

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

  // Company ESG/Sustainability Reports — water withdrawals (billion gallons)
  // Amazon: 2023 Sustainability Report (7.7B gal); others: 2022 reports
  const waterData = [
    { company: 'Amazon',    bg: 7.7 },
    { company: 'Google',    bg: 5.6 },
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
  const MAX_BG  = 7.7;
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

  // ── Impact map (Infrastructure Density) ──────────────────────────────────
  const MAP_DESC = 'Clustered bubbles reveal the gravity wells of US compute infrastructure — dense concentrations formed near cheap power, fiber corridors, and tax incentives. Click any cluster to zoom in and explore individual facilities. These concentrations are not random; they are the result of deliberate policy, economics, and geography.';

  const dcGeoJSON = { type: 'FeatureCollection', features: (rawDCData as any).features };

  let mapContainer: HTMLElement;
  let mapReady     = $state(false);
  let mapInitiated = false;
  let mapInstance: any = null;
  let hoveredInfo  = $state<{ name: string; operator: string } | null>(null);

  async function initImpactMap() {
    if (mapInitiated || !mapContainer) return;
    mapInitiated = true;

    const mb = (await import('mapbox-gl')).default;
    mb.accessToken = PUBLIC_MAPBOX_TOKEN;

    mapInstance = new mb.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-96, 38.5],
      zoom: 3.5,
      pitch: 0,
      attributionControl: false,
    });
    mapInstance.addControl(new mb.AttributionControl({ compact: true }), 'bottom-right');

    mapInstance.on('load', () => {
      mapInstance.addSource('dc-cl', {
        type: 'geojson', data: dcGeoJSON,
        cluster: true, clusterMaxZoom: 9, clusterRadius: 50,
      });

      mapInstance.addLayer({
        id: 'grav-cl', type: 'circle', source: 'dc-cl',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'],
            'rgba(189,255,255,0.18)', 5,
            'rgba(80,200,255,0.28)',  20,
            'rgba(40,100,255,0.35)', 50,
            'rgba(255,100,60,0.42)',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 16, 5, 26, 20, 38, 50, 52],
          'circle-stroke-color': ['step', ['get', 'point_count'],
            'rgba(189,255,255,0.35)', 5,
            'rgba(80,200,255,0.45)',  20,
            'rgba(40,100,255,0.5)',   50,
            'rgba(255,100,60,0.5)',
          ],
          'circle-stroke-width': 1.2,
        },
      });
      mapInstance.addLayer({
        id: 'grav-count', type: 'symbol', source: 'dc-cl',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 10,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': 'rgba(255,255,255,0.75)' },
      });
      mapInstance.addLayer({
        id: 'grav-pts', type: 'circle', source: 'dc-cl',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#bdffff',
          'circle-radius': 3,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.65],
        },
      });

      mapInstance.on('click', 'grav-cl', (e: any) => {
        const f = mapInstance.queryRenderedFeatures(e.point, { layers: ['grav-cl'] });
        (mapInstance.getSource('dc-cl') as any).getClusterExpansionZoom(
          f[0].properties.cluster_id,
          (err: any, zoom: number) => { if (!err) mapInstance.easeTo({ center: f[0].geometry.coordinates, zoom }); }
        );
      });
      mapInstance.on('mouseenter', 'grav-cl',  () => { mapInstance.getCanvas().style.cursor = 'pointer'; });
      mapInstance.on('mouseleave', 'grav-cl',  () => { mapInstance.getCanvas().style.cursor = ''; });
      mapInstance.on('mouseenter', 'grav-pts', (e: any) => {
        mapInstance.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        hoveredInfo = { name: p.name || p.operator || 'Data Center', operator: p.operator || '' };
      });
      mapInstance.on('mouseleave', 'grav-pts', () => { mapInstance.getCanvas().style.cursor = ''; hoveredInfo = null; });

      mapReady = true;
    });
  }

  $effect(() => {
    if (visibleSections.has('impact-map') && !mapInitiated) setTimeout(initImpactMap, 80);
  });

  // ── State electricity map ─────────────────────────────────────────────────
  // Per query energy: 0.003 kWh (Goldman Sachs Research, 2024)
  // Per million queries: 3 MWh · Source: EIA State Electricity Profiles 2022
  const KWH_PER_QUERY = 0.003;

  // Daily electricity per state in GWh (source values in kWh ÷ 1,000,000)
  // Sorted ascending — cumulative thresholds drive the map light-up sequence
  // Total: 10,680 GWh/day = 10.68 TWh/day across all 50 states
  const usaStates = [
    { name: 'Vermont',        abbr: 'VT', lat: 44.0,  lon: -72.7,  gwhDay:    20 },
    { name: 'Alaska',         abbr: 'AK', lat: 64.2,  lon: -153.4, gwhDay:    20 },
    { name: 'Hawaii',         abbr: 'HI', lat: 20.8,  lon: -156.3, gwhDay:    25 },
    { name: 'Delaware',       abbr: 'DE', lat: 39.0,  lon: -75.5,  gwhDay:    30 },
    { name: 'Rhode Island',   abbr: 'RI', lat: 41.7,  lon: -71.5,  gwhDay:    30 },
    { name: 'New Hampshire',  abbr: 'NH', lat: 43.7,  lon: -71.6,  gwhDay:    35 },
    { name: 'South Dakota',   abbr: 'SD', lat: 44.4,  lon: -100.2, gwhDay:    35 },
    { name: 'Maine',          abbr: 'ME', lat: 45.3,  lon: -69.0,  gwhDay:    40 },
    { name: 'Wyoming',        abbr: 'WY', lat: 43.0,  lon: -107.6, gwhDay:    40 },
    { name: 'Montana',        abbr: 'MT', lat: 46.9,  lon: -110.4, gwhDay:    45 },
    { name: 'North Dakota',   abbr: 'ND', lat: 47.5,  lon: -100.5, gwhDay:    50 },
    { name: 'Idaho',          abbr: 'ID', lat: 44.4,  lon: -114.5, gwhDay:    70 },
    { name: 'New Mexico',     abbr: 'NM', lat: 34.5,  lon: -106.1, gwhDay:    90 },
    { name: 'Nebraska',       abbr: 'NE', lat: 41.5,  lon: -99.9,  gwhDay:    90 },
    { name: 'West Virginia',  abbr: 'WV', lat: 38.9,  lon: -80.4,  gwhDay:    90 },
    { name: 'Connecticut',    abbr: 'CT', lat: 41.6,  lon: -72.7,  gwhDay:   110 },
    { name: 'Arkansas',       abbr: 'AR', lat: 34.8,  lon: -92.2,  gwhDay:   110 },
    { name: 'Nevada',         abbr: 'NV', lat: 39.3,  lon: -116.6, gwhDay:   110 },
    { name: 'Iowa',           abbr: 'IA', lat: 42.0,  lon: -93.5,  gwhDay:   120 },
    { name: 'Kansas',         abbr: 'KS', lat: 38.5,  lon: -98.4,  gwhDay:   120 },
    { name: 'Utah',           abbr: 'UT', lat: 39.3,  lon: -111.6, gwhDay:   120 },
    { name: 'Mississippi',    abbr: 'MS', lat: 32.7,  lon: -89.7,  gwhDay:   140 },
    { name: 'Oregon',         abbr: 'OR', lat: 44.0,  lon: -120.6, gwhDay:   160 },
    { name: 'Maryland',       abbr: 'MD', lat: 39.0,  lon: -76.8,  gwhDay:   160 },
    { name: 'Oklahoma',       abbr: 'OK', lat: 35.6,  lon: -97.5,  gwhDay:   180 },
    { name: 'Kentucky',       abbr: 'KY', lat: 37.7,  lon: -85.3,  gwhDay:   190 },
    { name: 'Colorado',       abbr: 'CO', lat: 39.0,  lon: -105.5, gwhDay:   200 },
    { name: 'Wisconsin',      abbr: 'WI', lat: 44.3,  lon: -89.8,  gwhDay:   200 },
    { name: 'Massachusetts',  abbr: 'MA', lat: 42.3,  lon: -71.8,  gwhDay:   210 },
    { name: 'Minnesota',      abbr: 'MN', lat: 46.3,  lon: -94.3,  gwhDay:   210 },
    { name: 'Missouri',       abbr: 'MO', lat: 38.5,  lon: -92.5,  gwhDay:   210 },
    { name: 'South Carolina', abbr: 'SC', lat: 33.8,  lon: -80.9,  gwhDay:   210 },
    { name: 'Alabama',        abbr: 'AL', lat: 32.8,  lon: -86.8,  gwhDay:   230 },
    { name: 'Louisiana',      abbr: 'LA', lat: 31.0,  lon: -91.8,  gwhDay:   240 },
    { name: 'Arizona',        abbr: 'AZ', lat: 34.3,  lon: -111.5, gwhDay:   250 },
    { name: 'Washington',     abbr: 'WA', lat: 47.4,  lon: -120.5, gwhDay:   260 },
    { name: 'New Jersey',     abbr: 'NJ', lat: 40.1,  lon: -74.4,  gwhDay:   270 },
    { name: 'Tennessee',      abbr: 'TN', lat: 35.9,  lon: -86.4,  gwhDay:   280 },
    { name: 'Indiana',        abbr: 'IN', lat: 39.8,  lon: -86.1,  gwhDay:   290 },
    { name: 'Virginia',       abbr: 'VA', lat: 37.8,  lon: -78.2,  gwhDay:   300 },
    { name: 'Michigan',       abbr: 'MI', lat: 44.2,  lon: -85.0,  gwhDay:   310 },
    { name: 'North Carolina', abbr: 'NC', lat: 35.6,  lon: -79.4,  gwhDay:   320 },
    { name: 'Georgia',        abbr: 'GA', lat: 32.7,  lon: -83.4,  gwhDay:   330 },
    { name: 'Ohio',           abbr: 'OH', lat: 40.4,  lon: -82.7,  gwhDay:   350 },
    { name: 'Illinois',       abbr: 'IL', lat: 40.0,  lon: -89.2,  gwhDay:   380 },
    { name: 'Pennsylvania',   abbr: 'PA', lat: 41.2,  lon: -77.2,  gwhDay:   400 },
    { name: 'New York',       abbr: 'NY', lat: 42.9,  lon: -75.5,  gwhDay:   420 },
    { name: 'Florida',        abbr: 'FL', lat: 27.7,  lon: -81.7,  gwhDay:   630 },
    { name: 'California',     abbr: 'CA', lat: 37.2,  lon: -119.4, gwhDay:   770 },
    { name: 'Texas',          abbr: 'TX', lat: 31.5,  lon: -99.3,  gwhDay:  1180 },
  ];

  // Cumulative GWh thresholds — a state lights up when the slider's total
  // energy reaches its cumulative sum (Vermont first at 20 GWh, Texas last at 10,680 GWh)
  const statesWithCum = (() => {
    let cum = 0;
    return usaStates.map(s => { cum += s.gwhDay; return { ...s, cumGwh: cum }; });
  })();
  const TOTAL_GWH = statesWithCum[statesWithCum.length - 1].cumGwh; // 10,680
  // cumThreshold lookup for boundaryGeoJSON (by state name)
  const cumThresholdMap = new Map(statesWithCum.map(s => [s.name, s.cumGwh]));

  // Log slider: 0–100 → 10^(2 + v × SLIDER_K/100) million queries
  // SLIDER_K chosen so slider=100 → stateTotalGwh = TOTAL_GWH (10,680 GWh = 10.68 TWh)
  // stateTotalGwh = stateQueriesM × KWH_PER_QUERY  (GWh, since M×0.003 = GWh)
  // At v=31: ~2.5B queries (ChatGPT daily, 7.5 GWh) | v=100: all 50 states lit
  const SLIDER_K = Math.log10(TOTAL_GWH / KWH_PER_QUERY) - 2; // ≈ 4.5514
  let stateSlider   = $state(31);
  let stateQueriesM = $derived(Math.round(Math.pow(10, 2 + stateSlider * SLIDER_K / 100)));

  // Energy in GWh: stateQueriesM [M] × 0.003 kWh/query × 10^6 queries/M ÷ 10^6 kWh/GWh
  let stateTotalGwh = $derived(stateQueriesM * KWH_PER_QUERY);

  // stateQueriesM is in millions: 1T = 1,000,000M, 1B = 1,000M
  let stateDisplayNum = $derived(
    stateQueriesM >= 1_000_000
      ? `${(stateQueriesM / 1_000_000).toFixed(stateQueriesM >= 10_000_000 ? 0 : 2)}`
      : stateQueriesM >= 1000
        ? `${(stateQueriesM / 1000).toFixed(stateQueriesM >= 10_000 ? 0 : 1)}`
        : stateQueriesM.toLocaleString()
  );
  let stateDisplayUnit = $derived(
    stateQueriesM >= 1_000_000 ? 'trillion' :
    stateQueriesM >= 1000      ? 'billion'  : 'million'
  );
  // Energy display: GWh below 1,000; TWh above
  let stateEnergyFmt = $derived(
    stateTotalGwh >= 1000 ? `${(stateTotalGwh / 1000).toFixed(2)} TWh` :
    stateTotalGwh >= 1    ? `${stateTotalGwh.toFixed(1)} GWh`          :
                            `${(stateTotalGwh * 1000).toFixed(0)} MWh`
  );

  // States light up cumulatively: each state's threshold = sum of all smaller states + itself
  let litStates = $derived(statesWithCum.filter(s => stateTotalGwh >= s.cumGwh));
  let litCount  = $derived(litStates.length);

  // Next state to light up is the first whose cumulative threshold hasn't been reached
  let nextState      = $derived(statesWithCum.find(s => stateTotalGwh < s.cumGwh) ?? null);
  let nextStateNeedM = $derived(nextState ? Math.ceil(nextState.cumGwh / KWH_PER_QUERY) : null);
  let nextStateDiffM = $derived(nextStateNeedM !== null ? nextStateNeedM - stateQueriesM : null);
  let nextDiffFmt    = $derived(
    nextStateDiffM === null ? '' :
    nextStateDiffM >= 1_000_000
      ? `+${(nextStateDiffM / 1_000_000).toFixed(1)}T`
      : nextStateDiffM >= 1000
        ? `+${(nextStateDiffM / 1000).toFixed(1)}B`
        : `+${nextStateDiffM.toLocaleString()}M`
  );

  let stateMapContainer: HTMLElement;
  let stateMapInstance: any = null;
  let stateMapInitiated = false;
  let stateMapReady     = $state(false);

  let boundaryGeoJSON = $derived({
    type: 'FeatureCollection' as const,
    features: (rawCensusStates as any).features.map((f: any) => ({
      ...f,
      properties: {
        ...f.properties,
        lit: stateTotalGwh >= (cumThresholdMap.get(f.properties.NAME) ?? Infinity) ? 1 : 0,
      }
    }))
  });

  let centroidGeoJSON = $derived({
    type: 'FeatureCollection' as const,
    features: statesWithCum.map(s => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] as [number, number] },
      properties: { abbr: s.abbr, lit: stateTotalGwh >= s.cumGwh ? 1 : 0 }
    }))
  });

  async function initStateMap() {
    if (stateMapInitiated || !stateMapContainer) return;
    stateMapInitiated = true;
    const mb = (await import('mapbox-gl')).default;
    mb.accessToken = PUBLIC_MAPBOX_TOKEN;
    stateMapInstance = new mb.Map({
      container: stateMapContainer,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-97, 38.5], zoom: 3.2, pitch: 0, attributionControl: false,
    });
    stateMapInstance.addControl(new mb.AttributionControl({ compact: true }), 'bottom-right');
    stateMapInstance.on('load', () => {
      stateMapInstance.addSource('state-bounds', { type: 'geojson', data: boundaryGeoJSON });
      stateMapInstance.addSource('state-pts',    { type: 'geojson', data: centroidGeoJSON });

      // Outer glow fill
      stateMapInstance.addLayer({ id: 'sb-glow', type: 'fill', source: 'state-bounds', paint: {
        'fill-color': '#bdffff',
        'fill-opacity': ['case', ['>', ['get', 'lit'], 0], 0.07, 0],
        'fill-opacity-transition': { duration: 500, delay: 0 },
      }});

      // Main fill
      stateMapInstance.addLayer({ id: 'sb-fill', type: 'fill', source: 'state-bounds', paint: {
        'fill-color': ['case', ['>', ['get', 'lit'], 0], '#bdffff', '#0d0d24'],
        'fill-opacity': ['case', ['>', ['get', 'lit'], 0], 0.18, 0.4],
        'fill-opacity-transition': { duration: 500, delay: 0 },
      }});

      // Border
      stateMapInstance.addLayer({ id: 'sb-line', type: 'line', source: 'state-bounds', paint: {
        'line-color': ['case', ['>', ['get', 'lit'], 0], 'rgba(189,255,255,0.85)', 'rgba(189,255,255,0.07)'],
        'line-width': ['case', ['>', ['get', 'lit'], 0], 1.5, 0.5],
      }});

      // State abbreviation labels
      stateMapInstance.addLayer({ id: 'sb-lbl', type: 'symbol', source: 'state-pts',
        layout: {
          'text-field': ['get', 'abbr'],
          'text-size': 9,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: {
          'text-color': ['case', ['>', ['get', 'lit'], 0], 'rgba(189,255,255,0.85)', 'rgba(40,40,70,0.45)'],
          'text-halo-color': 'rgba(0,0,0,0.5)', 'text-halo-width': 1,
        }
      });

      stateMapReady = true;
    });
  }

  $effect(() => {
    if (visibleSections.has('calc') && !stateMapInitiated) setTimeout(initStateMap, 100);
  });

  $effect(() => {
    if (stateMapReady) {
      (stateMapInstance?.getSource('state-bounds') as any)?.setData(boundaryGeoJSON);
      (stateMapInstance?.getSource('state-pts') as any)?.setData(centroidGeoJSON);
    }
  });

  let timerInterval: ReturnType<typeof setInterval>;

  onMount(() => {
    const t0 = Date.now();
    timerInterval = setInterval(() => { elapsed = (Date.now() - t0) / 1000; }, 100);
    requestAnimationFrame(() => { visible = true; });
  });

  onDestroy(() => {
    clearInterval(timerInterval);
    mapInstance?.remove();
    stateMapInstance?.remove();
  });

  function fmt(n: number)           { return Math.round(n).toLocaleString(); }
  function fmtDec(n: number, d = 1) { return n.toFixed(d); }

  // X-label indices for query chart
  const labelIndices = new Set([0, 6, 12, 18, 24, queryData.length - 1]);
</script>

<svelte:head>
  <title>The Invisible Weight — AI Infrastructure Impact</title>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css" rel="stylesheet" />
</svelte:head>

<!-- Fixed back button -->
{#if visible}
  <a
    href="/?start=true&step=4"
    class="back-btn"
    data-sveltekit-reload
    in:fly={{ x: -24, duration: 500, delay: 400 }}
  >
    <span class="arrow">←</span> Back
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
            <div class="hb-fill" style="width: {pct}%; transition: width 0.85s cubic-bezier(0.4,0,0.2,1) {i * 0.1}s"></div>
            <span class="hb-val">{d.bg}B gal</span>
          </div>
        </div>
      {/each}
      <p class="src-note">Source: Company ESG &amp; Sustainability Reports — Amazon 2023, others 2022</p>
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

  <!-- ══════════════════════════ SECTION 3: IMPACT MAP ════════════════════ -->
  <section class="ns" data-section="impact-map" use:observe>

    <div class="st" class:in={visibleSections.has('impact-map')}>
      <span class="eyebrow">03 — WHERE POWER MEETS PLACE</span>
      <h2>Infrastructure Density</h2>
      <p>
        804 US data centers, clustered to reveal the gravity wells of compute infrastructure.
        Dense concentrations formed near cheap power, fiber corridors, and favorable tax conditions.
        Click any cluster to zoom in. Zoom past level 8 to explore individual facilities.
      </p>
    </div>

    <div class="map-shell" class:in={visibleSections.has('impact-map')}>

      <!-- Legend -->
      <div class="map-legend">
        <span class="leg-end" style="color:#bdffff">Small cluster</span>
        <div class="leg-bar" style="background: linear-gradient(to right, rgba(189,255,255,0.5), rgba(80,200,255,0.6), rgba(40,100,255,0.7), rgba(255,100,60,0.8))"></div>
        <span class="leg-end" style="color:#ff9b9b">Large cluster</span>
        <span class="leg-src">Click cluster to zoom · 804 US facilities</span>
      </div>

      <!-- Mapbox map -->
      <div class="map-container" bind:this={mapContainer}>
        {#if !mapReady}
          <div class="map-loading">Initializing…</div>
        {/if}
      </div>

      <!-- Footer: description + hover tooltip -->
      <div class="map-footer">
        <p class="mode-desc">{MAP_DESC}</p>
        {#if hoveredInfo}
          <div class="hover-card">
            <span class="hc-name">{hoveredInfo.name}</span>
            {#if hoveredInfo.operator}<span class="hc-sub">{hoveredInfo.operator}</span>{/if}
          </div>
        {/if}
      </div>

      <p class="src-note">Data: OpenStreetMap contributors · 804 US facilities</p>
    </div>

  </section>

  <!-- ══════════════════════════ SECTION 4: STATE ELECTRICITY MAP ══════════ -->
  <section class="ns" data-section="calc" use:observe>

    <div class="st" class:in={visibleSections.has('calc')}>
      <span class="eyebrow">04 — HOW HEAVY IS YOUR USAGE?</span>
      <h2>How many states does your query volume power?</h2>
      <p>
        Every AI query draws real electricity from the grid. At collective scale,
        billions of queries become gigawatt-hours — enough to power entire states
        for a day. Drag the slider to see which US states light up as query volume grows.
      </p>
    </div>

    <!-- ── State map slider + visualization ───────────────────────────────── -->
    <div class="city-viz" class:in={visibleSections.has('calc')}>

      <!-- Slider header -->
      <div class="cv-slider-block">
        <div class="cv-slider-top">
          <span class="slider-label">Query volume</span>
          <div class="cv-query-display">
            <span class="cv-query-num">{stateDisplayNum}</span>
            <span class="cv-query-unit">{stateDisplayUnit} queries</span>
          </div>
        </div>

        <!-- Log-scale slider with reference markers -->
        <div class="cv-slider-wrap">
          <input type="range" min="0" max="100" bind:value={stateSlider} class="range" />
          <!-- ChatGPT daily ≈ 2.5B → 7.5 GWh → v≈31 with SLIDER_K=4.55 -->
          <div class="cv-ref-marker" style="left: 31%">
            <div class="cv-ref-line"></div>
            <span class="cv-ref-label">ChatGPT daily</span>
          </div>
          <!-- Slider max = all 50 states = 10,680 GWh = 10.68 TWh -->
          <div class="cv-ref-marker cv-ref-marker--all" style="left: 96%">
            <div class="cv-ref-line"></div>
            <span class="cv-ref-label">All 50 states</span>
          </div>
        </div>

        <div class="cv-scale-marks">
          <span>100M</span><span>1B</span><span>10B</span><span>100B</span><span>1T</span><span>3.6T</span>
        </div>
      </div>

      <!-- Energy equivalence banner -->
      <div class="cv-equiv-row">
        <div class="cv-equiv-item">
          <span class="cv-equiv-val">{stateEnergyFmt}</span>
          <span class="cv-equiv-lbl">electricity consumed</span>
        </div>
        <div class="cv-equiv-sep">→</div>
        <div class="cv-equiv-item">
          <span class="cv-equiv-val">{litCount} <span class="cv-of-total">/ {usaStates.length}</span></span>
          <span class="cv-equiv-lbl">states powered for a day</span>
        </div>
        <div class="cv-equiv-sep">→</div>
        <div class="cv-equiv-item">
          {#if nextState}
            <span class="cv-equiv-val coral">{nextDiffFmt}</span>
            <span class="cv-equiv-lbl">more to power {nextState.name}</span>
          {:else}
            <span class="cv-equiv-val" style="color:#bdffff">All 50 ✓</span>
            <span class="cv-equiv-lbl">all states powered</span>
          {/if}
        </div>
      </div>

      <!-- Unit conversion reference -->
      <div class="cv-unit-ref">
        <span class="cv-unit-item"><strong>1 TWh</strong> = 1,000 GWh</span>
        <span class="cv-unit-sep">·</span>
        <span class="cv-unit-item"><strong>1 GWh</strong> = 1,000 MWh</span>
        <span class="cv-unit-sep">·</span>
        <span class="cv-unit-item"><strong>1 MWh</strong> = 1,000 kWh</span>
        <span class="cv-unit-sep">·</span>
        <span class="cv-unit-item">US total: <strong>10,680 GWh</strong> / day = <strong>10.68 TWh</strong> / day</span>
      </div>

      <!-- Mapbox state electricity map -->
      <div class="cv-map-shell">
        <div class="cv-map-legend">
          <div class="cv-leg-item">
            <div class="cv-leg-dot lit"></div>
            <span>Powered ({litCount})</span>
          </div>
          <div class="cv-leg-item">
            <div class="cv-leg-dot"></div>
            <span>Not yet ({usaStates.length - litCount})</span>
          </div>
          <span class="cv-leg-note">State fill = daily electricity met by query volume</span>
        </div>

        <div class="cv-map-container" bind:this={stateMapContainer}>
          {#if !stateMapReady}
            <div class="map-loading">Initializing map…</div>
          {/if}
        </div>
      </div>

      <!-- Lit states chips -->
      {#if litCount > 0}
        <div class="cv-lit-list">
          <span class="cv-lit-label">Powered today:</span>
          <div class="cv-chips">
            {#each litStates as s}
              <div class="cv-chip">
                <span class="cv-chip-name">{s.name}</span>
                <span class="cv-chip-mwh">{s.gwhDay} GWh/day</span>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <p class="cv-start-hint">Drag the slider right to start powering states →</p>
      {/if}

    </div>

    <!-- ── Personal footprint calculator ─────────────────────────────────── -->
    <div class="st" class:in={visibleSections.has('calc')} style="margin-top: 1rem">
      <span class="eyebrow" style="margin-top:0">YOUR PERSONAL FOOTPRINT</span>
      <p style="margin-top:0.5rem">
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
      · State daily electricity in GWh — total 10,680 GWh/day = 10.68 TWh/day across all 50 states
      · States light up cumulatively as query energy accumulates; slider max = total US daily consumption
    </p>

  </section>

  <!-- ══════════════════════════ SECTION 4: GROWTH ════════════════════════ -->
  <section class="ns" data-section="growth" use:observe>

    <div class="st" class:in={visibleSections.has('growth')}>
      <span class="eyebrow">05 — THE ACCELERATION</span>
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
      <span class="eyebrow">06 — WHAT MUST CHANGE</span>
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

  /* ── City electricity visualization ─────────────────────────────────────── */
  .city-viz {
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.7s ease 0.18s, transform 0.7s ease 0.18s;
  }
  .city-viz.in { opacity: 1; transform: translateY(0); }

  .cv-slider-block { display: flex; flex-direction: column; gap: 0.75rem; }

  .cv-slider-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1rem;
  }

  .cv-query-display { text-align: right; line-height: 1; }
  .cv-query-num {
    font-size: clamp(1.8rem, 4vw, 2.8rem);
    color: #bdffff;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    line-height: 1;
  }
  .cv-query-unit {
    display: block;
    font-size: 0.52rem;
    letter-spacing: 2.5px;
    color: #383848;
    font-family: 'IBM Plex Mono', monospace;
    text-transform: uppercase;
    margin-top: 0.3rem;
  }

  .cv-slider-wrap { position: relative; padding-bottom: 1.6rem; }
  .cv-slider-wrap .range { width: 100%; }

  .cv-ref-marker {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    pointer-events: none;
  }
  .cv-ref-line {
    width: 1px;
    height: 10px;
    background: rgba(255, 155, 155, 0.5);
  }
  .cv-ref-label {
    font-size: 0.45rem;
    letter-spacing: 1.5px;
    color: #ff9b9b;
    font-family: 'IBM Plex Mono', monospace;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .cv-scale-marks {
    display: flex;
    justify-content: space-between;
    font-size: 0.5rem;
    color: #2a2a3a;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.5px;
  }

  .cv-equiv-row {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    background: rgba(189, 255, 255, 0.025);
    border: 1px solid rgba(189, 255, 255, 0.08);
    border-radius: 12px;
    padding: 1.1rem 1.5rem;
    flex-wrap: wrap;
  }
  .cv-equiv-item { display: flex; flex-direction: column; gap: 0.25rem; }
  .cv-equiv-val {
    font-size: clamp(1.1rem, 2.5vw, 1.6rem);
    color: #bdffff;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    line-height: 1;
  }
  .cv-equiv-val.coral { color: #ff9b9b; }
  .cv-of-total { font-size: 0.65em; color: #383848; font-weight: 400; }
  .cv-equiv-lbl {
    font-size: 0.52rem;
    color: #383848;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .cv-equiv-sep {
    font-size: 1.1rem;
    color: #1e1e2e;
    font-family: 'IBM Plex Mono', monospace;
    flex-shrink: 0;
  }

  .cv-map-shell {
    border: 1px solid rgba(189, 255, 255, 0.1);
    border-radius: 16px;
    overflow: hidden;
  }
  .cv-map-legend {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 0.6rem 1.25rem;
    background: rgba(5, 0, 16, 0.92);
    border-bottom: 1px solid rgba(189, 255, 255, 0.05);
    flex-wrap: wrap;
  }
  .cv-leg-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.55rem;
    color: #444455;
    font-family: 'IBM Plex Mono', monospace;
  }
  .cv-leg-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2a2a4a;
    border: 1px solid #3a3a5a;
    flex-shrink: 0;
  }
  .cv-leg-dot.lit {
    background: #bdffff;
    border-color: #bdffff;
    box-shadow: 0 0 8px rgba(189, 255, 255, 0.6);
  }
  .cv-leg-note {
    margin-left: auto;
    font-size: 0.48rem;
    color: #22222f;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.5px;
  }
  .cv-map-container {
    position: relative;
    height: 400px;
    background: #050010;
  }

  .cv-lit-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .cv-lit-label {
    font-size: 0.5rem;
    letter-spacing: 3px;
    color: #2e2e3e;
    font-family: 'IBM Plex Mono', monospace;
    text-transform: uppercase;
  }
  .cv-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .cv-chip {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    background: rgba(189, 255, 255, 0.05);
    border: 1px solid rgba(189, 255, 255, 0.18);
    border-radius: 7px;
    padding: 0.4rem 0.75rem;
    animation: chip-appear 0.3s ease forwards;
  }
  @keyframes chip-appear {
    from { opacity: 0; transform: translateY(4px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .cv-chip-name {
    font-size: 0.6rem;
    color: #bdffff;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
    white-space: nowrap;
  }
  .cv-chip-mwh {
    font-size: 0.48rem;
    color: #333344;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.5px;
  }
  .cv-start-hint {
    font-size: 0.65rem;
    color: #252535;
    font-family: 'Space Grotesk', sans-serif;
    text-align: center;
    padding: 1rem;
    margin: 0;
  }

  /* Unit conversion reference bar */
  .cv-unit-ref {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    background: rgba(189, 255, 255, 0.03);
    border: 1px solid rgba(189, 255, 255, 0.07);
    border-radius: 8px;
    padding: 0.55rem 1rem;
  }
  .cv-unit-item {
    font-size: 0.52rem;
    color: #3a3a4a;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.3px;
  }
  .cv-unit-item strong { color: #bdffff; font-weight: 600; }
  .cv-unit-sep { color: #1e1e2e; font-size: 0.6rem; font-family: 'IBM Plex Mono', monospace; }

  /* "All 50 states" reference marker */
  .cv-ref-marker--all .cv-ref-line  { background: #bdffff; }
  .cv-ref-marker--all .cv-ref-label { color: #bdffff; }

  /* ── Mobile ───────────────────────────────────────────────────── */
  /* ── Impact map section ──────────────────────────────────────────── */
  .map-shell {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.7s ease 0.18s, transform 0.7s ease 0.18s;
    border: 1px solid rgba(189,255,255,0.1);
    border-radius: 16px;
    overflow: hidden;
  }
  .map-shell.in { opacity: 1; transform: translateY(0); }

  /* Inline legend bar */
  .map-legend {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 1.25rem;
    background: rgba(5,0,16,0.9);
    border-bottom: 1px solid rgba(189,255,255,0.05);
    flex-wrap: wrap;
  }
  .leg-end {
    font-size: 0.55rem;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 1px;
    white-space: nowrap;
  }
  .leg-bar {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    min-width: 60px;
    max-width: 220px;
  }
  .leg-src {
    font-size: 0.5rem;
    color: #2a2a3a;
    font-family: 'IBM Plex Mono', monospace;
    margin-left: auto;
  }

  .map-container {
    position: relative;
    height: 460px;
    background: #050010;
  }

  .map-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 3px;
    color: #222230;
    text-transform: uppercase;
  }

  .map-footer {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: rgba(5,0,16,0.96);
    border-top: 1px solid rgba(189,255,255,0.05);
    min-height: 3.5rem;
    flex-wrap: wrap;
  }
  .mode-desc {
    font-size: 0.68rem;
    color: #333344;
    font-family: 'Space Grotesk', sans-serif;
    line-height: 1.65;
    margin: 0;
    flex: 1;
    max-width: 540px;
  }

  .hover-card {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    background: rgba(189,255,255,0.04);
    border: 1px solid rgba(189,255,255,0.14);
    border-radius: 8px;
    padding: 0.6rem 0.9rem;
    min-width: 160px;
    max-width: 220px;
    flex-shrink: 0;
  }
  .hc-name {
    font-size: 0.62rem;
    color: #bdffff;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hc-sub {
    font-size: 0.52rem;
    color: #444455;
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 1px;
  }
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
    .map-container { height: 320px; }
    .map-footer { flex-direction: column; }
    /* City electricity map mobile */
    .cv-query-num { font-size: 1.8rem; }
    .cv-equiv-row { flex-direction: column; gap: 0.85rem; padding: 0.9rem 1rem; }
    .cv-equiv-sep { display: none; }
    .cv-map-container { height: 260px; }
    .cv-leg-note { display: none; }
    .cv-slider-top { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
    .cv-query-display { text-align: left; }
  }
</style>
