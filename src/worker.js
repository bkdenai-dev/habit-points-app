import { DurableObject } from "cloudflare:workers";

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
      body.syncRevision = ((current && current.syncRevision) ? current.syncRevision : 0) + 1;
      body.lastSyncedAt = new Date().toISOString();

      await this.ctx.storage.put("family_state", body);

      return new Response(
        JSON.stringify({
          ok: true,
          syncRevision: body.syncRevision,
          lastSyncedAt: body.lastSyncedAt,
          state: body
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
