// Szakaszidő – ranglista API (Netlify Functions + Netlify Blobs)
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

// Szakaszok: hossz (m) és a cél helye a játék koordinátáiban (a rajt a 0,0 pont)
const STAGES = {"r_iklad": {"len": 2174, "end": [1097.7, 150.6]}, "r_domony": {"len": 2587, "end": [291.3, -233.5]}, "r_aszod": {"len": 2085, "end": [793.1, -185.6]}, "r_dunakeszi": {"len": 2458, "end": [670.6, 332.7]}, "r_fot": {"len": 2776, "end": [-594.9, -1442.0]}};
// Körpályák: a rajt és a cél ugyanott van (a kör kezdőpontja), a hossz az összes kör együtt
Object.assign(STAGES, {"k_iklad": {"len": 2760, "laps": 6, "start": [706.6, -14.3], "end": [706.6, -14.3]}, "k_domony": {"len": 2440, "laps": 4, "start": [816.9, 112.3], "end": [816.9, 112.3]}, "k_aszod": {"len": 3063, "laps": 3, "start": [-42.7, -176.3], "end": [-42.7, -176.3]}, "k_dunakeszi": {"len": 2460, "laps": 4, "start": [243.3, 399.3], "end": [243.3, 399.3]}, "k_fot": {"len": 2978, "laps": 2, "start": [-21.1, -527.5], "end": [-21.1, -527.5]}});
const MAX_PLAYERS = 500;

// Napi kihívás: a budapesti dátumból számolt szakasz és körülmény (a játék ugyanezzel a képlettel számol)
const DAILY_STAGES = ["r_iklad", "r_domony", "r_aszod", "r_dunakeszi", "r_fot"];
const DAILY_CONDS = ["dry", "rain", "dusk"];
const budapestDate = (ms) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date(ms));
function dailyFor(date) {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) { h ^= date.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  return { date, stage: DAILY_STAGES[h % DAILY_STAGES.length], cond: DAILY_CONDS[(h >>> 8) % DAILY_CONDS.length] };
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const bad = (msg, status = 400) => json({ error: msg }, status);

const cleanNick = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
const nickKey = (nick) => createHash("sha1").update(nick.toLowerCase()).digest("hex").slice(0, 24);
const hashToken = (t) => createHash("sha256").update(String(t)).digest("hex");
const sameHash = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const validToken = (t) => typeof t === "string" && /^[a-f0-9]{32,64}$/.test(t);

function cleanLook(l) {
  const hex = (v, d) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  const one = (v, opts, d) => (opts.includes(v) ? v : d);
  l = l && typeof l === "object" ? l : {};
  return {
    model: one(l.model, ["hatch", "sedan", "retro", "mini"], "hatch"),
    color: hex(l.color, "#E2231A"),
    color2: hex(l.color2, "#F2F2EE"),
    rim: hex(l.rim, "#F2F2EE"),
    livery: one(l.livery, ["none", "stripes", "band", "split"], "stripes"),
    wing: one(l.wing, ["none", "low", "wrc"], "wrc"),
    pod: !!l.pod,
    num: Math.min(99, Math.max(1, Math.round(Number(l.num) || 7))),
  };
}

// Egy menet ellenőrzése: reális idő, folytonos útvonal, rajttól a célig
function validRun(stage, t, d, splits) {
  const st = STAGES[stage];
  if (!st) return "Ismeretlen szakasz.";
  if (!Number.isInteger(t) || t < (st.len / 48) * 1000 || t > 15 * 60 * 1000) return "Valószínűtlen idő.";
  if (!Array.isArray(d) || d.length % 3 !== 0 || d.length < 30 || d.length > 3 * 9100) return "Hibás menetadat.";
  if (!d.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 20000)) return "Hibás menetadat.";
  const n = d.length / 3;
  if (Math.abs(n * 100 - t) > 400) return "A menet hossza nem egyezik az idővel.";
  const s0 = st.start || [0, 0];
  if (Math.hypot(d[0] - s0[0], d[1] - s0[1]) > 35) return "A menet nem a rajtnál kezdődik.";
  for (let i = 3; i < d.length; i += 3) if (Math.hypot(d[i] - d[i - 3], d[i + 1] - d[i - 2]) > 15) return "Szakadás a menetben.";
  if (Math.hypot(d[d.length - 3] - st.end[0], d[d.length - 2] - st.end[1]) > 45) return "A menet nem a célnál ér véget.";
  // a megtett út legalább a pálya hosszának 85%-a (körpályán ez akadályozza meg, hogy valaki egy helyben álljon)
  let path = 0;
  for (let i = 3; i < d.length; i += 3) path += Math.hypot(d[i] - d[i - 3], d[i + 1] - d[i - 2]);
  if (path < st.len * 0.85) return "A menet rövidebb a pályánál.";
  if (!Array.isArray(splits) || splits.length > (st.laps ? st.laps - 1 : 2) || !splits.every((v) => Number.isInteger(v) && v > 0 && v < t)) return "Hibás részidők.";
  return null;
}

// Bajnokság: az öt valódi szakasz ebben a sorrendben; a szerviz időbüntetése szakaszonként legfeljebb 10 perc
const CHAMP_STAGES = ["r_iklad", "r_domony", "r_aszod", "r_dunakeszi", "r_fot"];
async function champBoard(champ) {
  const { blobs } = await champ.list();
  const out = await Promise.all(blobs.map((b) => champ.get(b.key, { type: "json" })));
  return out.filter(Boolean).map((e) => ({ nick: e.nick, total: e.total, times: e.times, pen: e.pen, look: e.look || {} })).sort((a, b) => a.total - b.total);
}

async function dailyBoard(daily, date) {
  const { blobs } = await daily.list({ prefix: date + "/" });
  const out = await Promise.all(blobs.map((b) => daily.get(b.key, { type: "json" })));
  return out.filter(Boolean).map((e) => ({ nick: e.nick, t: e.t, look: e.look || {} })).sort((a, b) => a.t - b.t);
}

async function board(players) {
  const { blobs } = await players.list();
  const out = await Promise.all(
    blobs.map(async (b) => {
      const p = await players.get(b.key, { type: "json" });
      return p ? { nick: p.nick, look: p.look || {}, times: p.times || {} } : null;
    })
  );
  return out.filter(Boolean);
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  const players = getStore({ name: "players", consistency: "strong" });
  const ghosts = getStore({ name: "ghosts", consistency: "strong" });
  const daily = getStore({ name: "daily", consistency: "strong" });
  const champ = getStore({ name: "champ", consistency: "strong" });

  try {
    if (req.method === "GET" && route === "board") return json({ players: await board(players) });

    if (req.method === "GET" && route === "daily") {
      const d = dailyFor(budapestDate(Date.now()));
      return json({ ...d, rows: await dailyBoard(daily, d.date) });
    }

    if (req.method === "GET" && route === "champ") return json({ rows: await champBoard(champ) });

    if (req.method === "GET" && route === "ghost") {
      const stage = url.searchParams.get("stage"), nick = cleanNick(url.searchParams.get("nick"));
      if (!STAGES[stage] || !nick) return bad("Hiányzó adat.");
      const g = await ghosts.get(stage + "/" + nickKey(nick), { type: "json" });
      return g ? json(g) : bad("Nincs szellemautó.", 404);
    }

    if (req.method !== "POST") return bad("Nem támogatott kérés.", 405);
    const len = Number(req.headers.get("content-length") || 0);
    if (len > (route === "champ" ? 1500000 : 400000)) return bad("Túl nagy kérés.", 413); // a bajnokság öt menetet visz
    let body;
    try { body = await req.json(); } catch { return bad("Hibás kérés."); }
    const nick = cleanNick(body.nick);
    if (nick.length < 2) return bad("A név legalább 2 karakter legyen.");
    if (!validToken(body.token)) return bad("Hibás azonosító.");
    const key = nickKey(nick);
    const existing = await players.get(key, { type: "json" });
    if (existing && !sameHash(existing.tokenHash, hashToken(body.token))) return bad("Ezt a nevet már valaki más használja.", 409);

    const ensure = async () => {
      if (existing) return existing;
      const { blobs } = await players.list();
      if (blobs.length >= MAX_PLAYERS) throw Object.assign(new Error("Megtelt a ranglista."), { status: 503 });
      return { nick, tokenHash: hashToken(body.token), look: cleanLook(body.look), times: {}, created: Date.now() };
    };

    if (route === "register") {
      const p = await ensure();
      p.nick = nick;
      await players.setJSON(key, p);
      return json({ ok: true });
    }

    if (route === "look") {
      const p = await ensure();
      p.look = cleanLook(body.look);
      await players.setJSON(key, p);
      return json({ ok: true });
    }

    if (route === "score") {
      const { stage, t, d, splits } = body;
      const err = validRun(stage, t, d, splits);
      if (err) return bad(err);
      const p = await ensure();
      p.nick = nick;
      p.look = cleanLook(body.look);
      p.times = p.times || {};
      const prev = p.times[stage];
      const improved = !prev || t < prev;
      if (improved) {
        await ghosts.setJSON(stage + "/" + key, { t, splits, d });
        p.times[stage] = t;
      }
      await players.setJSON(key, p);
      return json({ ok: true, improved, players: await board(players) });
    }

    if (route === "champ") {
      const { runs, pen } = body;
      if (!Array.isArray(runs) || runs.length !== CHAMP_STAGES.length) return bad("Hiányos bajnokság.");
      if (!Array.isArray(pen) || pen.length !== CHAMP_STAGES.length || !pen.every((v) => Number.isInteger(v) && v >= 0 && v <= 600000)) return bad("Hibás büntetések.");
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i] || {};
        if (r.stage !== CHAMP_STAGES[i]) return bad("A szakaszok sorrendje nem stimmel.");
        const err = validRun(r.stage, r.t, r.d, r.splits);
        if (err) return bad((i + 1) + ". szakasz: " + err);
      }
      const times = runs.map((r) => r.t), total = times.reduce((a, b) => a + b, 0) + pen.reduce((a, b) => a + b, 0);
      const p = await ensure();
      p.nick = nick;
      p.look = cleanLook(body.look);
      await players.setJSON(key, p);
      const prev = await champ.get(key, { type: "json" });
      const improved = !prev || total < prev.total;
      if (improved) await champ.setJSON(key, { nick, total, times, pen, look: p.look, at: Date.now() });
      const rows = await champBoard(champ);
      return json({ ok: true, improved, total, rows, rank: rows.findIndex((r) => r.nick.toLowerCase() === nick.toLowerCase()) + 1 });
    }

    if (route === "daily") {
      // a tegnapi dátum is elfogadott, ha a menet éjfél előtt indult
      const { date, stage, cond, t, d, splits } = body;
      const now = Date.now(), okDates = [budapestDate(now), budapestDate(now - 6 * 3600 * 1000)];
      if (typeof date !== "string" || !okDates.includes(date)) return bad("Ez a napi kihívás már lejárt.");
      const want = dailyFor(date);
      if (stage !== want.stage || cond !== want.cond) return bad("Nem a mai kihívás szakasza.");
      const err = validRun(stage, t, d, splits);
      if (err) return bad(err);
      const p = await ensure();
      p.nick = nick;
      p.look = cleanLook(body.look);
      await players.setJSON(key, p);
      const dk = date + "/" + key, prev = await daily.get(dk, { type: "json" });
      const improved = !prev || t < prev.t;
      if (improved) await daily.setJSON(dk, { nick, t, look: p.look, at: now });
      const rows = await dailyBoard(daily, date);
      return json({ ok: true, improved, date, rows, rank: rows.findIndex((r) => r.nick.toLowerCase() === nick.toLowerCase()) + 1 });
    }

    return bad("Ismeretlen végpont.", 404);
  } catch (e) {
    return bad(e.status ? e.message : "Szerverhiba, próbáld újra.", e.status || 500);
  }
};

export const config = { path: "/api/*" };
