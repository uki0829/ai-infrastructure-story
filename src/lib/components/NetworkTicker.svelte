<script lang="ts">
  import { onMount } from 'svelte';

  // ── Types ─────────────────────────────────────────────────────────────────
  interface NetworkData {
    interface:     string;
    downloadSpeed: number;  // bytes/s
    uploadSpeed:   number;  // bytes/s
    totalReceived: number;  // cumulative bytes
    totalSent:     number;  // cumulative bytes
    sampledAt:     string;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let stats = $state<NetworkData>({
    interface:     '—',
    downloadSpeed: 0,
    uploadSpeed:   0,
    totalReceived: 0,
    totalSent:     0,
    sampledAt:     '',
  });
  let live      = $state(false);
  let fetchFail = $state(false);

  // ── Formatters ────────────────────────────────────────────────────────────
  // Primary human-readable (KB/s, MB/s, etc.)
  function fmtSpeed(b: number): string {
    if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(2)} MB/s`;
    if (b >= 1_024)     return `${(b / 1_024).toFixed(1)} KB/s`;
    return `${b} B/s`;
  }

  // Raw bytes/s shown alongside the human-readable speed
  function fmtSpeedBytes(b: number): string {
    return `${b.toLocaleString()} B/s`;
  }

  // Primary large-unit total (GB, MB…)
  function fmtBytes(b: number): string {
    if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`;
    if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`;
    if (b >= 1_024)         return `${(b / 1_024).toFixed(1)} KB`;
    return `${b} B`;
  }

  // Secondary unit one step smaller (e.g. GB → shows MB too)
  function fmtBytesAlt(b: number): string {
    if (b >= 1_073_741_824) return `${(b / 1_048_576).toFixed(0)} MB`;
    if (b >= 1_048_576)     return `${(b / 1_024).toFixed(0)} KB`;
    if (b >= 1_024)         return `${b.toLocaleString()} B`;
    return '';
  }

  // ── Polling — chained so requests never overlap ───────────────────────────
  onMount(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch('/api/network');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NetworkData = await res.json();
        if (active) { stats = data; live = true; fetchFail = false; }
      } catch {
        if (active) fetchFail = true;
      }
      if (active) setTimeout(poll, 150);
    }

    poll();
    return () => { active = false; };
  });
</script>

<!-- ── Markup ─────────────────────────────────────────────────────────────── -->
<div class="ticker-bar" role="status" aria-live="polite" aria-label="Live network statistics">

  <!-- Static left badge -->
  <div class="ticker-badge">
    <span class="badge-dot" class:live></span>
    <span class="badge-label">NET</span>
  </div>

  <!-- Scrolling viewport -->
  <div class="ticker-viewport">
    <div class="ticker-track" class:paused={fetchFail}>

      {#each [0, 1] as _, copy}
        <div class="ticker-row" aria-hidden={copy === 1 ? 'true' : undefined}>

          <!-- DOWN ↓ -->
          <span class="stat-item">
            <span class="stat-label down">↓ DOWN</span>
            <span class="stat-value down">{fmtSpeed(stats.downloadSpeed)}</span>
            <span class="stat-bytes down">{fmtSpeedBytes(stats.downloadSpeed)}</span>
          </span>
          <span class="divider">|</span>

          <!-- UP ↑ -->
          <span class="stat-item">
            <span class="stat-label up">↑ UP</span>
            <span class="stat-value up">{fmtSpeed(stats.uploadSpeed)}</span>
            <span class="stat-bytes up">{fmtSpeedBytes(stats.uploadSpeed)}</span>
          </span>
          <span class="divider">|</span>

          <!-- DATA RECEIVED -->
          <span class="stat-item">
            <span class="stat-label muted">DATA RECEIVED</span>
            <span class="stat-value muted">{fmtBytes(stats.totalReceived)}</span>
            <span class="stat-bytes muted">{fmtBytesAlt(stats.totalReceived)}</span>
          </span>
          <span class="divider">|</span>

          <!-- DATA SENT -->
          <span class="stat-item">
            <span class="stat-label muted">DATA SENT</span>
            <span class="stat-value muted">{fmtBytes(stats.totalSent)}</span>
            <span class="stat-bytes muted">{fmtBytesAlt(stats.totalSent)}</span>
          </span>
          <span class="divider">|</span>

          <!-- INTERFACE -->
          <span class="stat-item">
            <span class="stat-label iface">INTERFACE</span>
            <span class="stat-value iface">{stats.interface}</span>
          </span>

          <!-- Minimal seam gap — just enough to visually separate loops -->
          <span class="gap"></span>

        </div>
      {/each}

    </div>
  </div>

</div>

<!-- ── Styles ─────────────────────────────────────────────────────────────── -->
<style>
  /* ── Bar shell ────────────────────────────────────── */
  .ticker-bar {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 40px;
    z-index: 9999;
    display: flex;
    align-items: stretch;
    background: #080808;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    font-family: 'Corpta', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    overflow: hidden;
    user-select: none;
  }

  /* ── Left badge ───────────────────────────────────── */
  .ticker-badge {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    background: #0e0e0e;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
  }

  .badge-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #444;
    transition: background 0.4s;
    flex-shrink: 0;
  }
  .badge-dot.live {
    background: #ef4444;
    box-shadow: 0 0 5px #ef4444;
    animation: dot-pulse 1.8s ease-in-out infinite;
  }
  @keyframes dot-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.35; }
  }

  .badge-label {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #bbb;
  }

  /* ── Scrolling viewport ───────────────────────────── */
  .ticker-viewport {
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
  }

  .ticker-track {
    display: flex;
    width: max-content;
    animation: ticker-scroll 30s linear infinite;
    will-change: transform;
  }
  .ticker-track.paused          { animation-play-state: paused; }
  .ticker-bar:hover .ticker-track { animation-play-state: paused; }

  @keyframes ticker-scroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  /* ── Stat rows ────────────────────────────────────── */
  .ticker-row {
    display: flex;
    align-items: center;
    white-space: nowrap;
    padding: 0 0.75rem;   /* tighter row padding */
  }

  .stat-item {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    padding: 0 0.35rem;   /* tighter item padding */
  }

  .stat-label {
    font-size: 0.54rem;
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    opacity: 0.5;
  }

  .stat-value {
    font-size: 0.7rem;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* Raw byte count — smaller and dimmer, shown right after the primary value */
  .stat-bytes {
    font-size: 0.56rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.4;
    margin-left: 1px;
  }
  .stat-bytes::before { content: '('; }
  .stat-bytes::after  { content: ')'; }

  /* Color themes */
  .down  { color: #4ade80; }
  .up    { color: #fb923c; }
  .muted { color: #9ca3af; }
  .iface { color: #f3f4f6; }

  .divider {
    color: rgba(255, 255, 255, 0.12);
    font-size: 0.85rem;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
  }

  /* Minimal seam gap — 1.5 rem keeps a visual breath without a big hole */
  .gap {
    display: inline-block;
    width: 1.5rem;
    flex-shrink: 0;
  }
</style>
