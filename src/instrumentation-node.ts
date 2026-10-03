/**
 * Autoclip node-runtime instrumentation — spawns the engine supervisor (Python)
 * so FastAPI engine + LLM bridge live inside the app-server process tree and
 * survive tool-call exits. Single-instance via env flag + supervisor lock file.
 */
export async function register() {
  if (process.env.AUTOCLIP_SUPERVISOR === '1') return;
  process.env.AUTOCLIP_SUPERVISOR = '1';

  const { spawn } = await import('child_process');
  const path = await import('path');

  const root = path.resolve(process.cwd());
  const py = process.env.PYTHON_BIN || '/home/z/.venv/bin/python3';

  try {
    const child = spawn(py, ['-u', path.join(root, 'engine', 'supervisor.py')], {
      cwd: root,
      detached: false,
      stdio: 'ignore',
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    child.unref();
    console.log(`[autoclip] supervisor spawned (pid=${child.pid})`);
    child.on('exit', (code) => {
      console.log(`[autoclip] supervisor exited code=${code} — will be re-spawned by /api/engine/ensure`);
    });
  } catch (err) {
    console.error('[autoclip] failed to spawn supervisor:', err);
  }
}
