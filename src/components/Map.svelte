<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { PUBLIC_MAPBOX_TOKEN } from "$env/static/public";
  import datacenterData from "../data/datacenter.json";

  // --- 1. Types ---
  type StoryStep = {
    id: number;
    title: string;
    center: [number, number];
    zoom: number;
    pitch: number;
    description?: string;
    image?: string;
    imageLabel?: string;
  };

  type DataCenterFeature = {
    properties: Record<string, any>;
    geometry: { coordinates: [number, number] };
  };

  // --- 2. Props ---
  let {
    activeIndex = 0,
    isSatellite = false,
    storyData = [] as StoryStep[],
    selectedFeature = null as DataCenterFeature | null,
    showStory = false,
    userMarkerCoords = null as [number, number] | null,
    pendingCoords = null as [number, number] | null,
    onSelect,
    onMapClick,
    onLineDrawn,
    onConfirm, // CHANGED: added onConfirm prop
    onCancel, // CHANGED: added onCancel prop
    actions = $bindable() as
      | {
          drawLineToDC: (
            userCoords: [number, number],
            dc: DataCenterFeature,
          ) => void;
          clearLines: () => void;
          clearPending: () => void;
        }
      | undefined,
  }: {
    activeIndex?: number;
    isSatellite?: boolean;
    storyData?: StoryStep[];
    selectedFeature?: DataCenterFeature | null;
    showStory?: boolean;
    userMarkerCoords?: [number, number] | null;
    pendingCoords?: [number, number] | null;
    onSelect?: (feature: any) => void;
    onMapClick?: (coords: [number, number]) => void;
    onLineDrawn?: (dcId: string) => void;
    onConfirm?: () => void; // CHANGED: added onConfirm to type block
    onCancel?: () => void; // CHANGED: added onCancel to type block
    actions?: {
      drawLineToDC: (
        userCoords: [number, number],
        dc: DataCenterFeature,
      ) => void;
      clearLines: () => void;
      clearPending: () => void;
    };
  } = $props();

  const defaultView = {
    center: [-98.5795, 39.8283] as [number, number],
    zoom: 3.5,
    pitch: 0,
  };

  let mapContainer: HTMLDivElement = $state()!;
  let map: any = $state();
  let selectedName = $state("");
  let mapLoaded = $state(false);
  let _mapboxgl: any;
  let _userMarker: any = null;
  let _pendingMarker: any = null;

  // Source of truth for footprint lines — survives style swaps
  // because it lives in JS memory, not in the Mapbox source.
  let _footprintFeatures: any[] = [];

  // Plain non-reactive guard for style toggle
  let appliedStyle: string = "";

  const FOG_NORMAL = {
    color: "#110022",
    "high-color": "#00ffff",
    "horizon-blend": 0.1,
    "space-color": "#000000",
    "star-intensity": 0.8,
  };
  const FOG_HEAT = {
    color: "#440000",
    "high-color": "#ff0000",
    "horizon-blend": 0.3,
    "space-color": "#000000",
    "star-intensity": 0.2,
  };

  // Shared paint expressions used across all three glow layers
  function colorExpr(name: string) {
    return ["case", ["==", ["get", "name"], name], "#ffcc00", "#ff9b9b"];
  }
  const radiusExpr = ["+", ["/", ["get", "footprint"], 5], 4];

  const GLOW_LAYERS = [
    "datacenter-glow-outer",
    "datacenter-glow-mid",
    "datacenter-points",
  ];

  function setSelectedDatacenter(name: string) {
    selectedName = name;
    const expr = colorExpr(name);
    GLOW_LAYERS.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, "circle-color", expr);
      }
    });
  }

  // ── Footprint helpers ──────────────────────────────────────────────────

  // CHANGED: rainbow palette — each line cycles through these hues for a glowing effect
  const RAINBOW = [
    "#001f3f",
    "#003366",
    "#004d99",
    "#0066cc",
    "#0080ff",
    "#3399ff",
    "#66b2ff",
    "#80ccff",
    "#99e6ff",
    "#b3f0ff",
    "#ccf9ff",
  ];
  let _lineCount = 0; // increments per line drawn, drives color cycling

  function ensureFootprintLayers() {
    if (!map || !map.isStyleLoaded()) {
      requestAnimationFrame(ensureFootprintLayers);
      return;
    }
    if (!map.getSource("footprint-lines")) {
      map.addSource("footprint-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    if (!map.getLayer("footprint-lines-layer")) {
      // CHANGED: solid rainbow lines — color driven by 'lineColor' feature property
      // Three stacked layers simulate a glow: wide dim base + narrow bright core
      map.addLayer({
        id: "footprint-lines-glow",
        type: "line",
        source: "footprint-lines",
        filter: ["==", "$type", "LineString"],
        paint: {
          "line-color": ["coalesce", ["get", "lineColor"], "#ffffff"],
          "line-width": 12,
          "line-opacity": 0.18,
          "line-blur": 6,
        },
      });
      map.addLayer({
        id: "footprint-lines-mid",
        type: "line",
        source: "footprint-lines",
        filter: ["==", "$type", "LineString"],
        paint: {
          "line-color": ["coalesce", ["get", "lineColor"], "#ffffff"],
          "line-width": 5,
          "line-opacity": 0.55,
          "line-blur": 1.5,
        },
      });
      map.addLayer({
        id: "footprint-lines-layer",
        type: "line",
        source: "footprint-lines",
        filter: ["==", "$type", "LineString"],
        paint: {
          "line-color": ["coalesce", ["get", "lineColor"], "#ffffff"],
          "line-width": 2.5,
          "line-opacity": 1,
        },
      });
    }
    if (!map.getLayer("footprint-endpoints")) {
      // CHANGED: endpoint dot matches its line's rainbow color
      map.addLayer({
        id: "footprint-endpoints",
        type: "circle",
        source: "footprint-lines",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 4,
          "circle-color": ["coalesce", ["get", "lineColor"], "#ff9b9b"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9,
        },
      });
    }
    // Always rehydrate from our JS copy after a style swap
    if (_footprintFeatures.length > 0) {
      (map.getSource("footprint-lines") as any).setData({
        type: "FeatureCollection",
        features: _footprintFeatures,
      });
    }
  }

  function drawLineToDC(userCoords: [number, number], dc: DataCenterFeature) {
    if (!map || !map.getSource("footprint-lines")) return;
    const dcCoords = dc.geometry.coordinates;
    // FIXED: use _idx as the unique ID — name is not unique across all features
    const dcId =
      dc.properties._idx ?? dc.properties.name ?? String(Math.random());

    // Use our own array — never read from source._data
    // CHANGED: assign a cycling rainbow color to each new line
    const lineColor = RAINBOW[_lineCount % RAINBOW.length];
    _lineCount++;
    const features = [..._footprintFeatures];
    features.push({
      type: "Feature",
      properties: { dcId, lineColor },
      geometry: { type: "LineString", coordinates: [userCoords, dcCoords] },
    } as any);
    features.push({
      type: "Feature",
      properties: { dcId, lineColor },
      geometry: { type: "Point", coordinates: dcCoords },
    } as any);

    _footprintFeatures = features; // keep JS copy in sync
    (map.getSource("footprint-lines") as any).setData({
      type: "FeatureCollection",
      features,
    });

    if (onLineDrawn) onLineDrawn(dcId);
  }

  function clearLines() {
    if (!map || !map.getSource("footprint-lines")) return;
    _footprintFeatures = []; // reset JS copy
    _lineCount = 0; // CHANGED: reset color cycle on clear
    (map.getSource("footprint-lines") as any).setData({
      type: "FeatureCollection",
      features: [],
    });
  }

  function syncUserMarker(coords: [number, number] | null) {
    if (!map || !_mapboxgl) return;
    if (!coords) {
      _userMarker?.remove();
      _userMarker = null;
      return;
    }
    if (!_userMarker) {
      const el = document.createElement("div");
      el.className = "user-marker";
      el.innerHTML =
        '<div class="pulse-ring"></div><div class="marker-dot"></div>';
      _userMarker = new _mapboxgl.Marker({ element: el, draggable: false })
        .setLngLat(coords)
        .addTo(map);
    } else {
      _userMarker.setLngLat(coords);
    }
  }

  // CHANGED: syncPendingMarker now builds a confirm/cancel popup inside the marker element
  // and uses anchor:'bottom' so the dot sits on the pin point with the popup floating above
  function syncPendingMarker(coords: [number, number] | null) {
    if (!map || !_mapboxgl) return;
    if (!coords) {
      _pendingMarker?.remove();
      _pendingMarker = null;
      return;
    }
    if (!_pendingMarker) {
      const el = document.createElement("div");
      el.className = "pending-marker";
      // CHANGED: innerHTML now includes the popup with confirm/cancel above the dot
      el.innerHTML = `
        <div class="pending-popup">
          <p class="pending-label">Confirm location?</p>
          <div class="pending-actions">
            <button class="pending-confirm">✓ CONFIRM</button>
            <button class="pending-cancel">✕ CANCEL</button>
          </div>
        </div>
        <div class="pending-ring"></div>
        <div class="pending-dot"></div>
      `;
      // CHANGED: stopPropagation prevents map click from firing when buttons are pressed
      el.querySelector(".pending-confirm")!.addEventListener("click", (e) => {
        e.stopPropagation();
        if (onConfirm) onConfirm();
      });
      el.querySelector(".pending-cancel")!.addEventListener("click", (e) => {
        e.stopPropagation();
        if (onCancel) onCancel();
      });
      // CHANGED: anchor:'bottom' replaces default 'center' so dot aligns to the coordinate
      _pendingMarker = new _mapboxgl.Marker({
        element: el,
        anchor: "bottom",
        draggable: false,
      })
        .setLngLat(coords)
        .addTo(map);
    } else {
      _pendingMarker.setLngLat(coords);
    }
  }

  // ── Base map layers ────────────────────────────────────────────────────

  function addMapLayers(snapshotIndex: number = activeIndex) {
    if (!map || !map.isStyleLoaded()) {
      requestAnimationFrame(() => addMapLayers(snapshotIndex));
      return;
    }
    if (!map.getSource("datacenters")) {
      map.addSource("datacenters", { type: "geojson", data: datacenterData });
    }
    if (!map.getLayer("datacenter-heat")) {
      const beforeLayer = map.getLayer("admin-1-boundary-bg")
        ? "admin-1-boundary-bg"
        : undefined;
      map.addLayer(
        {
          id: "datacenter-heat",
          type: "heatmap",
          source: "datacenters",
          maxzoom: 15,
          paint: {
            "heatmap-weight": [
              "interpolate",
              ["linear"],
              ["get", "footprint"],
              0,
              0.5,
              100,
              2,
            ],
            "heatmap-intensity": snapshotIndex === 3 ? 2.0 : 0,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(0,0,0,0)",
              0.1,
              "rgba(255,50,50,0.2)",
              0.3,
              "rgba(255,0,0,0.5)",
              0.7,
              "rgba(200,0,0,0.8)",
              1,
              "rgba(150,0,0,0.9)",
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              5,
              5,
              30,
              10,
              80,
              15,
              150,
            ],
            "heatmap-opacity": snapshotIndex === 3 ? 0.85 : 0,
          },
        },
        beforeLayer,
      );
    }

    // ── Glow layers (added before core point so core renders on top) ──
    if (!map.getLayer("datacenter-points")) {
      const initColor = colorExpr(selectedName);

      // Outer glow
      map.addLayer({
        id: "datacenter-glow-outer",
        type: "circle",
        source: "datacenters",
        paint: {
          "circle-radius": ["+", radiusExpr, 16],
          "circle-color": initColor,
          "circle-opacity": 0.08,
          "circle-blur": 1,
          "circle-stroke-width": 0,
        },
      });

      // Mid glow
      map.addLayer({
        id: "datacenter-glow-mid",
        type: "circle",
        source: "datacenters",
        paint: {
          "circle-radius": ["+", radiusExpr, 8],
          "circle-color": initColor,
          "circle-opacity": 0.18,
          "circle-blur": 0.8,
          "circle-stroke-width": 0,
        },
      });

      // Core point
      map.addLayer({
        id: "datacenter-points",
        type: "circle",
        source: "datacenters",
        paint: {
          "circle-radius": radiusExpr,
          "circle-color": initColor,
          "circle-opacity": 0.8,
          "circle-blur": 0,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }

    map.off("mouseenter", "datacenter-points", onMouseEnter);
    map.off("mouseleave", "datacenter-points", onMouseLeave);
    map.off("click", "datacenter-points", onPointClick);
    map.on("mouseenter", "datacenter-points", onMouseEnter);
    map.on("mouseleave", "datacenter-points", onMouseLeave);
    map.on("click", "datacenter-points", onPointClick);
  }

  function onMouseEnter() {
    map.getCanvas().style.cursor = "pointer";
  }
  function onMouseLeave() {
    map.getCanvas().style.cursor = "";
  }
  function onPointClick(e: any) {
    const feature = e.features[0];
    setSelectedDatacenter(feature.properties.name);
    if (onSelect) onSelect(feature);
    new _mapboxgl.Popup({ offset: 15, className: "dark-popup" })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(
        `<h3 style="color:#ff9b9b; margin:0; font-family:'Corpta', monospace;">${feature.properties.name}</h3>`,
      )
      .addTo(map);
  }

  onMount(async () => {
    const mapboxModule = await import("mapbox-gl");
    _mapboxgl = mapboxModule.default;
    _mapboxgl.accessToken = PUBLIC_MAPBOX_TOKEN;

    map = new _mapboxgl.Map({
      container: mapContainer,
      style: isSatellite
        ? "mapbox://styles/mapbox/satellite-streets-v12"
        : "mapbox://styles/mapbox/dark-v11",
      center: defaultView.center,
      zoom: defaultView.zoom,
      pitch: defaultView.pitch,
      projection: "globe",
    });

    map.on("load", () => {
      appliedStyle = isSatellite ? "satellite" : "dark";
      mapLoaded = true;
      addMapLayers();
      ensureFootprintLayers();
      map.setFog(FOG_NORMAL);
      actions = {
        drawLineToDC,
        clearLines,
        clearPending: () => syncPendingMarker(null),
      };
    });

    // Map click → set user marker pin only (no line drawn here)
    map.on("click", (e: any) => {
      const hit = map.queryRenderedFeatures(e.point, {
        layers: ["datacenter-points"],
      });
      if (hit.length > 0) return;
      if (onMapClick) onMapClick([e.lngLat.lng, e.lngLat.lat]);
    });
  });

  // Clean up Mapbox when the component is destroyed (e.g. on SvelteKit navigation).
  // Without this, navigating away and back throws because Mapbox still holds
  // a reference to the (now-removed) canvas element.
  onDestroy(() => {
    if (map) {
      map.remove();
    }
  });

  // --- 4. STYLE TOGGLE ---
  $effect(() => {
    const wantSatellite = isSatellite;
    if (!map || !mapLoaded) return;

    const newLabel = wantSatellite ? "satellite" : "dark";
    if (appliedStyle === newLabel) return;
    appliedStyle = newLabel;

    const newUrl = wantSatellite
      ? "mapbox://styles/mapbox/satellite-streets-v12"
      : "mapbox://styles/mapbox/dark-v11";

    const indexAtSwap = activeIndex;
    map.setStyle(newUrl);

    map.once("style.load", () => {
      addMapLayers(indexAtSwap);
      // ensureFootprintLayers rehydrates from _footprintFeatures automatically
      ensureFootprintLayers();
      actions = {
        drawLineToDC,
        clearLines,
        clearPending: () => syncPendingMarker(null),
      };
      map.setFog(indexAtSwap === 3 ? FOG_HEAT : FOG_NORMAL);
    });
  });

  // --- 5. CAMERA & FOG ---
  $effect(() => {
    if (!map || !mapLoaded || !storyData[activeIndex]) return;
    setSelectedDatacenter("");
    const target = storyData[activeIndex];
    if (activeIndex === 4) {
      map.setFog(FOG_HEAT);
      if (map.getLayer("datacenter-heat")) {
        map.setPaintProperty("datacenter-heat", "heatmap-intensity", 2.0);
        map.setPaintProperty("datacenter-heat", "heatmap-opacity", 0.85);
      }
    } else {
      map.setFog(FOG_NORMAL);
      if (map.getLayer("datacenter-heat")) {
        map.setPaintProperty("datacenter-heat", "heatmap-intensity", 0);
        map.setPaintProperty("datacenter-heat", "heatmap-opacity", 0);
      }
    }
    map.flyTo({
      center: target.center,
      zoom: target.zoom,
      pitch: target.pitch,
      speed: 0.8,
      curve: 1.2,
      essential: true,
    });
  });

  // --- 6. SELECTION & RESET ---
  $effect(() => {
    if (!map || !mapLoaded) return;
    setSelectedDatacenter(selectedFeature?.properties.name || "");
    if (!selectedFeature && !showStory) {
      map.flyTo({ ...defaultView, speed: 1.2, essential: true });
      return;
    }
    if (selectedFeature && !showStory) {
      map.flyTo({
        center: selectedFeature.geometry.coordinates,
        zoom: 14,
        pitch: 45,
        speed: 1.2,
        essential: true,
      });
    }
  });

  // --- 7. USER MARKER ---
  $effect(() => {
    if (!map || !mapLoaded) return;
    syncUserMarker(userMarkerCoords ?? null);
  });

  // --- 8. PENDING MARKER ---
  $effect(() => {
    if (!map || !mapLoaded) return;
    syncPendingMarker(pendingCoords ?? null);
  });
</script>

<div
  bind:this={mapContainer}
  style="position: fixed; inset: 0; z-index: 0; background: #111;"
></div>

<style>
  :global(.dark-popup .mapboxgl-popup-content) {
    background: #222;
    color: white;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 10px;
  }
  :global(.user-marker) {
    position: relative;
    width: 20px;
    height: 20px;
    cursor: crosshair;
  }
  :global(.pending-marker) {
    position: relative;
    width: 20px;
    height: 20px;
    cursor: crosshair;
  }
  :global(.pending-dot) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ffcc00;
    border: 2px solid #fff;
    z-index: 2;
  }
  :global(.pending-ring) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(255, 204, 0, 0.7);
    animation: pulse-out 1.6s ease-out infinite;
    z-index: 1;
  }
  :global(.marker-dot) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ddacfb;
    border: 2px solid #fff;
    z-index: 2;
  }
  :global(.pulse-ring) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(189, 255, 255, 0.6);
    animation: pulse-out 1.6s ease-out infinite;
    z-index: 1;
  }
  @keyframes pulse-out {
    0% {
      transform: translate(-50%, -50%) scale(0.6);
      opacity: 1;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.2);
      opacity: 0;
    }
  }

  /* CHANGED: new styles for the popup that floats above the pending marker dot */
  :global(.pending-popup) {
    position: absolute;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(10, 10, 10, 0.92);
    border: 1px solid #bdffff;
    border-radius: 8px;
    padding: 0.5rem 0.6rem;
    white-space: nowrap;
    font-family: 'Corpta', monospace;
    pointer-events: auto;
    z-index: 10;
  }
  :global(.pending-label) {
    font-size: 0.55rem;
    color: #bdffff;
    margin: 0 0 0.4rem;
    letter-spacing: 1px;
    text-align: center;
  }
  :global(.pending-actions) {
    display: flex;
    gap: 0.4rem;
  }
  :global(.pending-confirm) {
    flex: 1;
    background: #bdffff;
    color: #000;
    border: none;
    padding: 0.3rem 0.5rem;
    border-radius: 5px;
    cursor: pointer;
    font-family: 'Corpta', monospace;
    font-size: 0.55rem;
    font-weight: bold;
  }
  :global(.pending-cancel) {
    flex: 1;
    background: none;
    color: #ff9b9b;
    border: 1px solid #ff9b9b;
    padding: 0.3rem 0.5rem;
    border-radius: 5px;
    cursor: pointer;
    font-family: 'Corpta', monospace;
    font-size: 0.55rem;
  }
</style>
