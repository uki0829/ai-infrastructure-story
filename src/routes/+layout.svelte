<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';
  import NetworkTicker from '$lib/components/NetworkTicker.svelte';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

<NetworkTicker />

<!-- 40 px spacer so fixed ticker never overlaps page content -->
<div class="ticker-spacer"></div>

{@render children()}

<style>
  @font-face {
    font-family: 'Corpta';
    src: url('/fonts/corpta.otf') format('opentype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

  /* Default: all UI, titles, nav → Corpta */
  :global(*) {
    font-family: 'Corpta', monospace;
  }

  /* Content text → Space Grotesk */
  :global(p, li, input, textarea, .content-font) {
    font-family: 'Space Grotesk', sans-serif;
  }

  .ticker-spacer {
    height: 40px;
    flex-shrink: 0;
  }

  :global(body) {
    padding-top: 0;
  }
</style>
