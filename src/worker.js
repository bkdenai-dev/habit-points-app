import { DurableObject } from "cloudflare:workers";

// ==========================================
// 1. Edge Neural TTS Sec-MS-GEC v2 Pure JS DRM
// ==========================================
const U32 = 0xFFFFFFFF;
const SHA256_INIT = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
const SHA256_STATE = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2];
const SHA256_SCHEDULE = [
  0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0,
  0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564
];
const SHA256_ROUND_CONSTANTS = [
  0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
  0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
  0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
  0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
  0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
  0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
  0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
  0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
];
const SHA256_ADJUSTMENT = 0xC9DC06A7;
const SHA256_BLOCK_CONSTANTS = [...SHA256_ROUND_CONSTANTS.slice(0, 14), SHA256_ADJUSTMENT, ...SHA256_ROUND_CONSTANTS.slice(15)];
const CS64_COEFFICIENTS = [
  [0xE82E91B1, 0xB32700D0], [0x44DE24C6, 0x88DFF51D], [0x3BEB65BC, 0x29514038], [0xC89C5933, 0xB328CBDF],
  [0x8D1EC211, 0xD405B4D5], [0x314EF5D5, 0x26E55F3C], [0xE92491B1, 0x607801C6], [0xF0A5B9D5, 0x82B2C1FB],
  [0x06064CF3, 0xFA51A3DA], [0xDA79FA60, 0x207CC464], [0xBED20560, 0x3C3C74F3], [0x89F9C9F8, 0xD2D14B61],
  [0x35FA38C6, 0xBB04A2C1], [0xCB49E3C6, 0xC5626167]
];
const CS64_FACTOR = 0x82893933;
const CS64_ADJUSTMENT0 = 0xF2F90B1A;
const CS64_ADJUSTMENT1 = 0x0B1A0000;

function rol16(v) { v = v >>> 0; return (((v << 16) | (v >>> 16)) >>> 0); }
function sigma0(v) { v = v >>> 0; return (((v >>> 7) | (v << 25)) ^ ((v >>> 18) | (v << 14)) ^ (v >>> 3)) >>> 0; }
function sigma1(v) { v = v >>> 0; return (((v >>> 17) | (v << 15)) ^ ((v >>> 19) | (v << 13)) ^ (v >>> 10)) >>> 0; }

function sha256Rounds(state, words, firstRound = 0) {
  let [a, b, c, d, e, f, g, h] = state;
  const constants = firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  for (let i = firstRound; i < 64; i++) {
    const s1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
    const ch = ((e & f) ^ ((~e) & g)) >>> 0;
    const t1 = (h + s1 + ch + constants[i] + words[i]) >>> 0;
    const s0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
    const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
    const t2 = (s0 + maj) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0;
    d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  return [a, b, c, d, e, f, g, h];
}

function expandSchedule(words, firstWord = 16) {
  for (let i = firstWord; i < 64; i++) {
    const s1 = sigma1(words[i - 2]);
    const s0 = sigma0(words[i - 15]);
    words[i] = (s1 + words[i - 7] + s0 + words[i - 16]) >>> 0;
  }
}

function sha256Digest(data) {
  const words = new Array(64).fill(0);
  words[14] = ((data[0] << 16) | (data[1] << 8) | data[2]) >>> 0;
  words[15] = ((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) >>> 0;
  for (let i = 16; i < 30; i++) {
    let val = SHA256_SCHEDULE[i - 16];
    if (i - 2 >= 14) val = (val + (i === 16 ? (sigma1(words[i - 2]) ^ 0x000B92C0) : sigma1(words[i - 2]))) >>> 0;
    if (i - 7 >= 14) val = (val + words[i - 7]) >>> 0;
    if (i - 15 >= 14) val = (val + (i === 29 ? (sigma0(words[i - 15]) ^ 0x059C0B80) : sigma0(words[i - 15]))) >>> 0;
    words[i] = val >>> 0;
  }
  words[30] = (sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14] + SHA256_ADJUSTMENT - SHA256_ROUND_CONSTANTS[14]) >>> 0;
  expandSchedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  let state = SHA256_INIT.map((x, idx) => (x + working[idx]) >>> 0);

  const length = 57 + data.length;
  const rem = ((55 - length) % 64 + 64) % 64;
  const padded = new Uint8Array(data.length - 7 + 1 + rem + 8);
  padded.set(data.subarray(7), 0);
  padded[data.length - 7] = 0x80;
  const dvPadded = new DataView(padded.buffer);
  dvPadded.setBigUint64(padded.length - 8, BigInt(length * 8), false);

  for (let offset = 0; offset < padded.length; offset += 64) {
    const blockWords = new Array(64);
    for (let j = 0; j < 16; j++) blockWords[j] = dvPadded.getUint32(offset + j * 4, false);
    expandSchedule(blockWords, 16);
    const roundOut = sha256Rounds(state, blockWords, 0);
    state = state.map((x, idx) => (x + roundOut[idx]) >>> 0);
  }
  const digestU8 = new Uint8Array(32);
  const dvDigest = new DataView(digestU8.buffer);
  for (let i = 0; i < 8; i++) dvDigest.setUint32(i * 4, state[i], false);
  return digestU8;
}

function cs64Digest(data, digestU8) {
  const dvDigest = new DataView(digestU8.buffer);
  let keyA = (dvDigest.getUint32(0, true) | 1) >>> 0;
  let keyB = (dvDigest.getUint32(4, true) | 1) >>> 0;
  const factors = [Math.imul(keyA, CS64_FACTOR) >>> 0, Math.imul(keyB, CS64_FACTOR) >>> 0];
  const terms = [], offsets = [];
  CS64_COEFFICIENTS.forEach(([coef, off], i) => {
    terms.push(Math.imul(coef, factors[i % 2]) >>> 0);
    offsets.push(off >>> 0);
  });

  const paddedData = new Uint8Array(1 + data.length);
  paddedData[0] = 0;
  paddedData.set(data, 1);
  const padLen = (4 - (paddedData.length % 4)) % 4;
  const fullData = new Uint8Array(paddedData.length + padLen);
  fullData.set(paddedData, 0);
  const dvFull = new DataView(fullData.buffer);
  const wordsLe = [];
  for (let i = 0; i < fullData.length; i += 4) wordsLe.push(dvFull.getUint32(i, true));
  if (wordsLe.length % 2 !== 0) wordsLe.push(0);

  wordsLe.forEach((word, i) => {
    let term = Math.imul(word, (i % 2 === 0 ? keyA : keyB)) >>> 0;
    let offset = Math.imul(rol16(word), (i % 2 === 0 ? 0xEF0569FB : 0xC31713DB)) >>> 0;
    if (i === 0) {
      term = (term + Math.imul(CS64_ADJUSTMENT0, factors[0])) >>> 0;
      offset = (offset + CS64_ADJUSTMENT1) >>> 0;
    }
    terms.push(term);
    offsets.push(offset);
  });

  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16((offsets[i] + x) >>> 0);
    let q = Math.imul(t, 0x76F50F34) >>> 0;
    swapAcc = (swapAcc + Math.imul(rol16(q), 0xC3EFEA97) + q) >>> 0;

    t = rol16((offsets[i + 1] + y) >>> 0);
    q = Math.imul(t, 0x1881CE3C) >>> 0;
    swapLast = (Math.imul(rol16(q), 0x35BD1EC9) + q) >>> 0;
    swapAcc = (swapAcc + swapLast) >>> 0;

    state = (Math.imul(state, keyA) + x) >>> 0;
    state = Math.imul(rol16(state), 0xCF98B111) >>> 0;
    state = Math.imul(rol16(state), 0x87085B9F) >>> 0;
    state = Math.imul(rol16(state), 0x12CEB96D) >>> 0;
    state = Math.imul(rol16(state), 0x257E1D83) >>> 0;
    acc = (acc + state) >>> 0;

    t = (Math.imul(state, keyB) + y) >>> 0;
    t = Math.imul(rol16(t), 0xA27416F5) >>> 0;
    t = Math.imul(rol16(t), 0xD38396FF) >>> 0;
    state = Math.imul(rol16(Math.imul(rol16(t), 0x7C932B89) >>> 0), 0xBFA49F69) >>> 0;
    acc = (acc + state) >>> 0;
  }
  const w1 = (swapLast ^ state) >>> 0;
  const w2 = (swapAcc ^ acc) >>> 0;
  const outBuf = new Uint8Array(8);
  const dvOut = new DataView(outBuf.buffer);
  dvOut.setUint32(0, w1, true);
  dvOut.setUint32(4, w2, true);
  return Array.from(outBuf).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function generateSecMsGecV2(unixTs = Math.floor(Date.now() / 1000)) {
  let ticks = unixTs + 11644473600;
  ticks -= (ticks % 300);
  ticks *= 10000000;
  const str = `${ticks.toFixed(0)}6A5AA1D4EAFF4E9FB37E23D68491D6F4`;
  const data = new TextEncoder().encode(str);
  const shaU8 = sha256Digest(data);
  const cs64Str = cs64Digest(data, shaU8);
  const shaHex = Array.from(shaU8).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `${cs64Str}-${shaHex}`;
}

function dateToString() {
  const d = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = n => String(n).padStart(2, "0");
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
}

// Map friendly voice keys to Edge Neural voice names
const VOICE_MAP = {
  "xiaoxiao": "zh-CN-XiaoxiaoNeural",       // 温暖知性真人姐姐音 (Default)
  "yunxi": "zh-CN-YunxiNeural",             // 阳光元气少年伙伴音
  "xiaoyi": "zh-CN-XiaoyiNeural",           // 亲切甜美名师音
  "yunjian": "zh-CN-YunjianNeural",         // 活力青年音
  "yunyang": "zh-CN-YunyangNeural"          // 权威播音员
};

async function synthesizeEdgeNeuralTTS(text, voiceKey = "xiaoxiao") {
  const voiceName = VOICE_MAP[voiceKey] || VOICE_MAP["xiaoxiao"];
  const token = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const secMsGec = generateSecMsGecV2();
  const connId = crypto.randomUUID().replace(/-/g, "");
  const muid = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const wsUrl = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${token}&ConnectionId=${connId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=2-143.0.3650.75`;

  const resp = await fetch(wsUrl, {
    headers: {
      "Upgrade": "websocket",
      "Connection": "Upgrade",
      "Pragma": "no-cache",
      "Cache-Control": "no-cache",
      "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
      "Cookie": `muid=${muid};`
    }
  });

  const ws = resp.webSocket;
  if (!ws) throw new Error("WebSocket handshake not upgraded");
  ws.accept();

  return new Promise((resolve, reject) => {
    const audioChunks = [];
    const timeout = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      reject(new Error("Edge Neural TTS timeout"));
    }, 4500);

    ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          try { ws.close(); } catch (_) {}
          const totalLength = audioChunks.reduce((acc, c) => acc + c.byteLength, 0);
          const merged = new Uint8Array(totalLength);
          let offset = 0;
          for (const c of audioChunks) {
            merged.set(c, offset);
            offset += c.byteLength;
          }
          resolve(merged.buffer);
        }
      } else if (event.data instanceof ArrayBuffer) {
        const u8 = new Uint8Array(event.data);
        if (u8.length >= 2) {
          const headerLen = (u8[0] << 8) | u8[1];
          if (u8.length >= 2 + headerLen) {
            const headerStr = new TextDecoder().decode(u8.subarray(2, 2 + headerLen));
            if (headerStr.includes("Path:audio")) {
              audioChunks.push(u8.subarray(2 + headerLen));
            }
          }
        }
      }
    });

    ws.addEventListener("error", (err) => {
      clearTimeout(timeout);
      try { ws.close(); } catch (_) {}
      reject(err);
    });

    const ts = dateToString();
    const configMsg = `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`;
    ws.send(configMsg);

    const reqId = crypto.randomUUID().replace(/-/g, "");
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${voiceName}"><prosody pitch="+0Hz" rate="+0%" volume="+0%">${escaped}</prosody></voice></speak>`;
    const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}Z\r\nPath:ssml\r\n\r\n${ssml}`;
    ws.send(ssmlMsg);
  });
}

// ==========================================
// 2. State & Transaction Synchronization Engine
// ==========================================
function mergeAndRecomputeState(existing, incoming) {
  if (!existing || incoming.isReset) {
    incoming.syncRevision = ((existing && existing.syncRevision) ? existing.syncRevision : 0) + 1;
    incoming.lastSyncedAt = new Date().toISOString();
    delete incoming.isReset;
    return incoming;
  }

  const incomingTxMap = new Map();
  for (const tx of (incoming.transactions || [])) {
    if (tx && tx.id) incomingTxMap.set(tx.id, tx);
  }

  const mergedTxMap = new Map(incomingTxMap);
  for (const oldTx of (existing.transactions || [])) {
    if (oldTx && oldTx.id && !mergedTxMap.has(oldTx.id)) {
      mergedTxMap.set(oldTx.id, oldTx);
    } else if (oldTx && oldTx.id && mergedTxMap.has(oldTx.id)) {
      const incTx = mergedTxMap.get(oldTx.id);
      if (oldTx.auditStatus === "rejected" || incTx.auditStatus === "rejected") {
        incTx.auditStatus = "rejected";
      } else if (oldTx.auditStatus === "approved" || incTx.auditStatus === "approved") {
        incTx.auditStatus = "approved";
      }
    }
  }

  // 权威守护：彻底防御安安历史误触比赛流水复活
  for (const tx of mergedTxMap.values()) {
    if (tx && tx.childId === "kayden") {
      if (
        tx.reason?.includes("音乐比赛") ||
        tx.reason?.includes("钢琴考级") ||
        tx.taskKey?.includes("音乐比赛") ||
        tx.taskKey?.includes("钢琴考级")
      ) {
        tx.auditStatus = "rejected";
      }
    }
  }

  const allTx = Array.from(mergedTxMap.values());
  const initTxs = allTx.filter(t => t.taskKey === "init" || String(t.id).startsWith("init_"));
  if (!initTxs.some(t => t.childId === "brayden")) {
    initTxs.push({
      id: "init_brayden",
      dateKey: "2026-10-29",
      timestamp: "10-29 08:00",
      childId: "brayden",
      type: "earn",
      pointsChange: 148,
      taskKey: "init",
      auditStatus: "approved",
      reason: "初始底账同步 (含历史 $20.00)"
    });
  }
  if (!initTxs.some(t => t.childId === "kayden")) {
    initTxs.push({
      id: "init_kayden",
      dateKey: "2026-10-29",
      timestamp: "10-29 08:00",
      childId: "kayden",
      type: "earn",
      pointsChange: 57,
      taskKey: "init",
      auditStatus: "approved",
      reason: "初始底账同步 (含历史 $6.70)"
    });
  }
  const normalTxs = allTx.filter(t => !(t.taskKey === "init" || String(t.id).startsWith("init_")));

  normalTxs.sort((a, b) => {
    const ta = parseInt(String(a.id).replace("tx_", ""), 10) || 0;
    const tb = parseInt(String(b.id).replace("tx_", ""), 10) || 0;
    return tb - ta;
  });

  const seqCounter = {};
  for (let i = normalTxs.length - 1; i >= 0; i--) {
    const t = normalTxs[i];
    if (t && t.type === "earn" && t.taskKey && t.taskKey !== "init" && t.auditStatus !== "rejected") {
      const k = `${t.childId}_${t.dateKey || "2026-10-29"}_${t.taskKey}`;
      seqCounter[k] = (seqCounter[k] || 0) + 1;
      t.dailySeq = seqCounter[k];
    }
  }

  const finalTransactions = [...normalTxs.slice(0, 300), ...initTxs];

  const existingChildMap = new Map((existing.children || []).map(c => [c.id, c]));
  const mergedChildren = (incoming.children || []).map(child => {
    const oldChild = existingChildMap.get(child.id) || {};
    const childTxs = finalTransactions.filter(t => t.childId === child.id && t.auditStatus !== "rejected");

    const computedPoints = childTxs.reduce((sum, t) => sum + (Number(t.pointsChange) || 0), 0);

    const dailyTasks = {};
    for (const t of childTxs) {
      if (t.type === "earn" && t.taskKey && t.taskKey !== "init" && t.dateKey) {
        if (!dailyTasks[t.dateKey]) dailyTasks[t.dateKey] = {};
        dailyTasks[t.dateKey][t.taskKey] = (dailyTasks[t.dateKey][t.taskKey] || 0) + 1;
      }
    }

    const rejectedTicketIds = new Set(
      finalTransactions.filter(t => t.auditStatus === "rejected" && t.ticketId).map(t => t.ticketId)
    );
    const ticketMap = new Map();
    for (const tk of [...(child.tickets || []), ...(oldChild.tickets || [])]) {
      if (tk && tk.id && !rejectedTicketIds.has(tk.id)) {
        if (!ticketMap.has(tk.id)) {
          ticketMap.set(tk.id, tk);
        } else {
          const cur = ticketMap.get(tk.id);
          if (tk.used || cur.used) cur.used = true;
        }
      }
    }

    const dailyRedemptions = { ...(oldChild.dailyRedemptions || {}), ...(child.dailyRedemptions || {}) };

    return {
      ...oldChild,
      ...child,
      currentPoints: Math.max(0, computedPoints),
      dailyTasks,
      dailyRedemptions,
      tickets: Array.from(ticketMap.values())
    };
  });

  const mergedState = {
    ...existing,
    ...incoming,
    children: mergedChildren,
    transactions: finalTransactions,
    syncRevision: ((existing && existing.syncRevision) ? existing.syncRevision : 0) + 1,
    lastSyncedAt: new Date().toISOString()
  };

  delete mergedState.isReset;
  return mergedState;
}

export class HabitStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/state") {
      const state = await this.ctx.storage.get("family_state");
      return new Response(
        JSON.stringify({
          ok: true,
          state: state || null,
          serverTime: Date.now()
        }),
        {
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    if (request.method === "POST" && url.pathname === "/api/state") {
      const body = await request.json();
      if (!body || !body.children) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid state payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json;charset=UTF-8" }
        });
      }

      const current = await this.ctx.storage.get("family_state");
      const merged = mergeAndRecomputeState(current, body);

      await this.ctx.storage.put("family_state", merged);

      return new Response(
        JSON.stringify({
          ok: true,
          syncRevision: merged.syncRevision,
          lastSyncedAt: merged.lastSyncedAt,
          state: merged
        }),
        {
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    return new Response(JSON.stringify({ ok: false, error: "Not found" }), { status: 404 });
  }
}

// ==========================================
// 3. Fallback Pedagogical Smart Coach
// ==========================================
function generateSmartCoachFallback(childId, msg) {
  const m = (msg || "").toLowerCase();
  if (childId === "brayden") {
    if (m.includes("难") || m.includes("不想") || m.includes("不会") || m.includes("放弃")) {
      return "咕咕！遇到难题就像推开一扇藏宝密室的门，感到难太正常啦！我们不急着全做完，你先挑最容易的一小步攻破它好吗？你可以的！";
    }
    if (m.includes("讲") || m.includes("学了") || m.includes("懂了") || m.includes("费曼")) {
      return "太棒啦！你能用自己的话讲出来，说明知识已经真正属于你的大脑啦！这就是大科学家的费曼输出法，给你点赞！";
    }
    if (m.includes("考") || m.includes("题") || m.includes("为什么")) {
      return "好呀！翻转小考官上线！你来给爸妈出一道题考考他们，或者把题目里的数字变一变，看谁先解出来！";
    }
    if (m.includes("错") || m.includes("粗心") || m.includes("掉坑")) {
      return "咕咕！恭喜你抓到了一只错题虫！发现错误就是升级大脑的最好机会，快把这个坑记在脑子里，下次就不会再掉进去啦！";
    }
    return "咕咕！我是智慧猫头鹰博士！今天又准备好挑战哪座知识城堡了吗？保持思考，你的每一步努力我都看在眼里！";
  } else {
    // Kayden (安安)
    if (m.includes("鞋") || m.includes("穿") || m.includes("衣")) {
      return "嗷呜！小老虎安安真能干！自己穿鞋穿衣服，动作敏捷又帅气，就像森林里的小小勇士！";
    }
    if (m.includes("睡") || m.includes("困") || m.includes("做梦")) {
      return "嗷呜~ 小老虎揉揉小眼睛，安心躺好闭上眼。安安静静不乱动，今晚做个甜甜的冒险美梦吧！";
    }
    if (m.includes("收拾") || m.includes("玩具") || m.includes("饭")) {
      return "太厉害啦安安！玩具回家了，饭菜吃光光，小老虎力气满满，妈妈夸你是最棒的小帮手！";
    }
    return "嗷呜！我是森林小老虎！安安今天也要开开心心，听话懂事，养成好多好多棒棒的好习惯！";
  }
}

// ==========================================
// 4. Main Worker Fetch Router
// ==========================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // --- Endpoint: Interactive AI Companion Chat (POST /api/chat) ---
    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const childId = body.childId || "brayden";
        const message = (body.message || "").trim();
        const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

        if (!message) {
          return new Response(JSON.stringify({ ok: false, error: "Empty message" }), {
            status: 400,
            headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*" }
          });
        }

        let reply = "";
        if (env.AI) {
          try {
            const systemPrompt = childId === "brayden"
              ? "你叫智慧猫头鹰博士，是6岁半小男孩Brayden（小名健健）的专属AI伴学成长导师。遵循《如何培养孩子自主学习力》：1.遇到畏难时先意译认可他的情绪感受，引导做15分钟专注或三步微分解；2.绝不直接给出作业最终答案，引导他用自己的话讲一遍（费曼输出）或先猜想假设；3.夸奖必须聚焦思考过程与努力策略而非天赋；4.语气幽默睿智，每句简练在65字以内，末尾鼓励他探索赚积分！"
              : "你叫森林小老虎伙伴，是4岁小男孩Kayden（小名安安）的专属启蒙成长玩伴。语气超级可爱活泼萌趣，多用拟声词（如嗷呜、好棒呀！），鼓励他自己穿鞋穿衣、收拾玩具、自己吃饭、安心入睡，每句简短在40字以内，充满爱和肯定！";

            const messages = [
              { role: "system", content: systemPrompt },
              ...history.map(h => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content || "").slice(0, 150) })),
              { role: "user", content: message.slice(0, 200) }
            ];

            const aiResp = await env.AI.run("@cf/qwen/qwen1.5-14b-chat-awq", {
              messages,
              max_tokens: 120,
              temperature: 0.7
            });

            if (aiResp && aiResp.response) {
              reply = aiResp.response.trim();
            }
          } catch (aiErr) {
            console.warn("Workers AI call failed, falling back to smart coach:", aiErr);
          }
        }

        if (!reply) {
          reply = generateSmartCoachFallback(childId, message);
        }

        return new Response(JSON.stringify({ ok: true, reply, childId }), {
          status: 200,
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // --- Endpoint: Ultra-Realistic Human TTS (GET /api/tts) ---
    if (url.pathname === "/api/tts" && (request.method === "GET" || request.method === "HEAD")) {
      const text = (url.searchParams.get("text") || "").trim().slice(0, 200);
      const voice = url.searchParams.get("voice") || url.searchParams.get("style") || "xiaoxiao";

      if (!text) {
        return new Response("Missing text", { status: 400 });
      }

      // Check Edge Cache first
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), request);
      let cachedResp = await cache.match(cacheKey);
      if (cachedResp) return cachedResp;

      let audioBuf = null;

      // Tier 1: Microsoft Edge Neural TTS (Natural Human Voices)
      if (["xiaoxiao", "yunxi", "xiaoyi", "yunjian", "yunyang", "zh-CN-XiaoxiaoNeural", "zh-CN-YunxiNeural"].includes(voice)) {
        try {
          audioBuf = await synthesizeEdgeNeuralTTS(text, voice);
        } catch (edgeErr) {
          console.warn("Edge Neural TTS failed, trying Google TTS fallback:", edgeErr);
        }
      }

      // Tier 2: Google TTS Fallback
      if (!audioBuf) {
        try {
          const tl = (voice === "cn" || voice === "xiaoxiao" || voice === "yunxi") ? "zh-CN" : "zh-TW";
          const gUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${tl}&client=tw-ob&ttsspeed=1`;
          const upstream = await fetch(gUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
            }
          });
          if (upstream.ok) {
            audioBuf = await upstream.arrayBuffer();
          }
        } catch (gErr) {
          console.error("Google TTS failed:", gErr);
        }
      }

      if (!audioBuf) {
        return new Response("TTS synthesis failed", { status: 502 });
      }

      const resp = new Response(audioBuf, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=604800, s-maxage=604800",
          "Access-Control-Allow-Origin": "*"
        }
      });
      ctx.waitUntil(cache.put(cacheKey, resp.clone()));
      return resp;
    }

    // --- Endpoint: Durable Object State Sync (/api/state) ---
    if (url.pathname.startsWith("/api/")) {
      try {
        if (env.HABIT_STORE) {
          const id = env.HABIT_STORE.idFromName("global_family_v1");
          const stub = env.HABIT_STORE.get(id);
          return await stub.fetch(request);
        }
        return new Response(JSON.stringify({ ok: false, error: "HABIT_STORE binding missing" }), {
          status: 503,
          headers: { "Content-Type": "application/json;charset=UTF-8" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 500,
          headers: { "Content-Type": "application/json;charset=UTF-8" }
        });
      }
    }

    // Static Assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Habit Points Worker Active", { status: 200 });
  }
};
