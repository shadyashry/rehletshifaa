// Single-user latency baseline (sequential, think time), tunnel vs local, within the gateway budgets.
// Usage: node perf-baseline.mjs > perf-baseline.json
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
async function series(label, url, n, thinkMs, headers = {}) {
  const ms = [], codes = {};
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    try { const r = await fetch(url, { headers }); await r.arrayBuffer(); codes[r.status] = (codes[r.status] ?? 0) + 1; }
    catch (e) { codes.ERR = (codes.ERR ?? 0) + 1; }
    ms.push(performance.now() - t0); await sleep(thinkMs);
  }
  const out = { label, url, n, codes, p50: Math.round(q(ms, 50)), p95: Math.round(q(ms, 95)), p99: Math.round(q(ms, 99)), max: Math.round(Math.max(...ms)) };
  console.error(JSON.stringify(out)); return out;
}
const O = { origin: "https://dev.rehletshifaa.com" };
const res = [];
// Frontend pages (request-rendered Next), through Cloudflare and locally.
for (const path of ["/en", "/ar", "/en/consultants", "/en/send-my-case", "/en/track-case"]) {
  res.push(await series(`web tunnel ${path}`, `https://dev.rehletshifaa.com${path}`, 15, 300));
  res.push(await series(`web local ${path}`, `http://localhost:3000${path}`, 15, 300));
}
// Public API (30/min, burst 15 per client at the gateway): 12 samples each, 2.2 s apart.
res.push(await series("api tunnel public consultants", "https://api-dev.rehletshifaa.com/api/v1/public/consultants?locale=en", 12, 2200, O));
res.push(await series("api local-gateway public consultants", "http://localhost:8081/api/v1/public/consultants?locale=en", 12, 2200, O));
res.push(await series("api backend-direct public consultants", "http://localhost:8080/api/v1/public/consultants?locale=en", 12, 300, O));
res.push(await series("health tunnel", "https://api-dev.rehletshifaa.com/actuator/health", 15, 300));
res.push(await series("health backend-direct", "http://localhost:8080/actuator/health", 15, 300));
console.log(JSON.stringify({ at: new Date().toISOString(), results: res }, null, 1));
