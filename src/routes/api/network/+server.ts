import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// systeminformation reads local OS network stats and cannot run in a
// serverless/hosted environment. This stub keeps the API contract intact
// so NetworkTicker renders without errors (it handles 0-values gracefully).
export const GET: RequestHandler = async () => {
  return json({
    interface:     'n/a',
    downloadSpeed: 0,
    uploadSpeed:   0,
    totalReceived: 0,
    totalSent:     0,
    sampledAt:     new Date().toISOString(),
  });
};
