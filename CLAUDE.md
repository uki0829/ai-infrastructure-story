# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**"The Invisible Occupants"** — An interactive data story mapping the physical and environmental footprint of AI infrastructure across the US. Built with SvelteKit + Mapbox GL JS.

## Commands

```bash
npm run dev          # Start dev server (HMR)
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # TypeScript/Svelte type checking
npm run check:watch  # Watch mode type checking
```

No test suite is configured.

## Architecture

### Routes & Pages
- `src/routes/+page.svelte` — Main interactive map page; owns all story state, user interaction logic, and component orchestration
- `src/routes/digital-footprint/+page.svelte` — Secondary page with data visualization (Vega-Lite charts)

### Components
- `src/components/Map.svelte` — Mapbox GL JS wrapper; manages layers, markers, heatmap, footprint lines, and glow effects. Exposes a `actions` binding for parent-driven map control.
- `src/components/ClickMeter.svelte` — Battery/charge meter UI with particle and explosion animations

### Data
- `src/data/datacenter.json` — GeoJSON FeatureCollection of US data centers (804KB); each feature has a unique `_idx` property used for deduplication
- `src/data/gpt_query_data.json` — Vega-Lite spec + data for the ChatGPT query growth timeline (Nov 2022–Mar 2026)

### State & Interactivity (Svelte 5 Runes)
- All reactive state in `+page.svelte` uses `$state`, `$derived`, `$effect`
- Map receives props and callbacks; exposes `bind:actions={mapActions}` for parent to trigger camera/layer changes
- **Story mode**: 7 narrative steps, each triggering `flyTo` animations with pitch/zoom
- **Footprint tracker**: User clicks map → yellow pending pin → confirm/cancel → draws colored lines to data centers. SPACEBAR accelerates connection speed (30ms–400ms interval). Unique data centers tracked by `_idx`.
- **Style switching**: Dark v11 ↔ Satellite Streets; footprint lines persist across style switches via `_footprintFeatures` JS array

### Key Conventions
- Mapbox token is embedded directly in `Map.svelte`
- Mapbox GL JS is loaded via CDN (not npm), declared as external in vite config
- 3-layer glow system for data center points: outer glow → mid → core
- Color palette: cyan `#bdffff`, coral `#ff9b9b`, dark bg `#050010`; font: IBM Plex Mono
