import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Module-level state persists across requests in dev (long-running Node process).
// In serverless production the stats fall back to zeros gracefully.
let prev: { rx: number; tx: number; ts: number; iface: string } | null = null;

export const GET: RequestHandler = async () => {
  try {
    const si = await import('systeminformation');

    // networkStats('*') returns an array of all interfaces
    const rawStats = await si.networkStats('*');
    const statsList = Array.isArray(rawStats) ? rawStats : [rawStats];

    // Pick the interface with the most total traffic (usually Wi-Fi / Ethernet)
    const active = statsList
      .filter(s => s.iface && (s.rx_bytes > 0 || s.tx_bytes > 0))
      .sort((a, b) => (b.rx_bytes + b.tx_bytes) - (a.rx_bytes + a.tx_bytes))[0]
      ?? statsList[0];

    if (!active) throw new Error('no interface');

    const now = Date.now();
    let downloadSpeed = 0;
    let uploadSpeed   = 0;

    if (prev && prev.iface === active.iface) {
      const dt = (now - prev.ts) / 1000;  // seconds
      if (dt > 0) {
        downloadSpeed = Math.max(0, (active.rx_bytes - prev.rx) / dt);
        uploadSpeed   = Math.max(0, (active.tx_bytes - prev.tx) / dt);
      }
    }

    prev = { rx: active.rx_bytes, tx: active.tx_bytes, ts: now, iface: active.iface };

    return json({
      interface:     active.iface,
      downloadSpeed,
      uploadSpeed,
      totalReceived: active.rx_bytes,
      totalSent:     active.tx_bytes,
      sampledAt:     new Date().toISOString(),
    });
  } catch {
    // Serverless / unsupported environment — return safe zeros
    return json({
      interface:     'n/a',
      downloadSpeed: 0,
      uploadSpeed:   0,
      totalReceived: 0,
      totalSent:     0,
      sampledAt:     new Date().toISOString(),
    });
  }
};
