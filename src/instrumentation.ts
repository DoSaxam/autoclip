/**
 * Autoclip instrumentation — runs once when the Next.js server starts.
 * Node-only logic lives in instrumentation-node.ts (dynamically imported)
 * so the Edge-runtime static analyzer never sees `child_process`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
