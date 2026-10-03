/**
 * Self-heal route: verifies the engine (FastAPI :8001) and LLM bridge (:8002)
 * are healthy; respawns the supervisor if anything is down. Called by the
 * frontend on load and whenever a job API call fails with 502/503.
 */
import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function check(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function spawnSupervisor() {
  const root = path.resolve(process.cwd());
  const py = process.env.PYTHON_BIN || '/home/z/.venv/bin/python3';
  try {
    const child = spawn(py, ['-u', path.join(root, 'engine', 'supervisor.py')], {
      cwd: root,
      stdio: 'ignore',
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const engineOk = await check('http://127.0.0.1:8001/engine/health');
  const bridgeOk = await check('http://127.0.0.1:8002/health');
  if (!engineOk || !bridgeOk) {
    await spawnSupervisor();
    // wait briefly for cold start
    const deadline = Date.now() + 30000;
    let ok = engineOk;
    while (!ok && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      ok = await check('http://127.0.0.1:8001/engine/health');
    }
    const bridgeOk2 = await check('http://127.0.0.1:8002/health');
    return NextResponse.json(
      { engine: ok, bridge: bridgeOk2, healed: true },
      { status: ok ? 200 : 503 }
    );
  }
  return NextResponse.json({ engine: true, bridge: true, healed: false });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
