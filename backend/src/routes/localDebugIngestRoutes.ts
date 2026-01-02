import { Router } from 'express';
import fs from 'fs';
import path from 'path';

type DebugPayload = {
  sessionId?: string;
  runId?: string;
  hypothesisId?: string;
  location?: string;
  message?: string;
  data?: any;
  timestamp?: number;
};

function safeString(v: unknown, maxLen: number) {
  const s = typeof v === 'string' ? v : String(v ?? '');
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

function sanitizeData(data: any) {
  // Only allow shallow, small payloads to avoid secrets/PII and huge logs.
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, any> = {};
  const keys = Object.keys(data).slice(0, 30);
  for (const k of keys) {
    const key = safeString(k, 80);
    if (/token|password|secret|cookie|csrf|email/i.test(key)) continue;
    const v = (data as any)[k];
    if (typeof v === 'string') out[key] = safeString(v, 300);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[key] = v;
    else out[key] = safeString(v, 200);
  }
  return out;
}

const router = Router();

router.post('/ingest', (req, res) => {
  try {
    const body = (req.body || {}) as DebugPayload;
    const entry = {
      sessionId: safeString(body.sessionId, 120),
      runId: safeString(body.runId, 120),
      hypothesisId: safeString(body.hypothesisId, 40),
      location: safeString(body.location, 180),
      message: safeString(body.message, 240),
      data: sanitizeData(body.data),
      timestamp: typeof body.timestamp === 'number' ? body.timestamp : Date.now()
    };

    // backend is usually started from /backend; write logs to repo root/.cursor/debug.log
    const logPath = path.resolve(process.cwd(), '..', '.cursor', 'debug.log');
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
});

export default router;


