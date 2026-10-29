import { DurableObject } from "cloudflare:workers";

function mergeAndRecomputeState(existing, incoming) {
  if (!existing || incoming.isReset) {
    incoming.syncRevision = ((existing && existing.syncRevision) ? existing.syncRevision : 0) + 1;
    incoming.lastSyncedAt = new Date().toISOString();
    delete incoming.isReset;
    return incoming;
  }

  // Merge transactions by id (incoming status updates win, missing transactions from either side are preserved)
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
      // If either side rejected or approved a pending transaction, preserve the more advanced auditStatus
      if (oldTx.auditStatus === "rejected" || incTx.auditStatus === "rejected") {
        incTx.auditStatus = "rejected";
      } else if (oldTx.auditStatus === "approved" || incTx.auditStatus === "approved") {
        incTx.auditStatus = "approved";
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

  const finalTransactions = [...normalTxs.slice(0, 300), ...initTxs];

  // Recompute each child's points, dailyTasks, dailyRedemptions, and merge tickets
  const existingChildMap = new Map((existing.children || []).map(c => [c.id, c]));
  const mergedChildren = (incoming.children || []).map(child => {
    const oldChild = existingChildMap.get(child.id) || {};
    const childTxs = finalTransactions.filter(t => t.childId === child.id && t.auditStatus !== "rejected");

    // Calculate exact points from non-rejected transactions
    const computedPoints = childTxs.reduce((sum, t) => sum + (Number(t.pointsChange) || 0), 0);

    // Recompute dailyTasks from non-rejected earn transactions
    const dailyTasks = {};
    for (const t of childTxs) {
      if (t.type === "earn" && t.taskKey && t.taskKey !== "init" && t.dateKey) {
        if (!dailyTasks[t.dateKey]) dailyTasks[t.dateKey] = {};
        dailyTasks[t.dateKey][t.taskKey] = (dailyTasks[t.dateKey][t.taskKey] || 0) + 1;
      }
    }

    // Merge tickets by id (excluding rejected redemptions)
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

    // Merge dailyRedemptions
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

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

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Habit Points Worker Active", { status: 200 });
  }
};
