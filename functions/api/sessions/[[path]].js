/**
 * Cloudflare Pages Functions Handler for /api/sessions
 * Provides edge D1 database integration with user isolation for AI Voice Studio.
 */

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY"
        }
    });
}

function getUserId(request) {
    const headerId = request.headers.get("X-User-Id");
    if (headerId && /^[a-zA-Z0-9_-]{1,64}$/.test(headerId)) {
        return headerId;
    }
    const url = new URL(request.url);
    const queryId = url.searchParams.get("user_id");
    if (queryId && /^[a-zA-Z0-9_-]{1,64}$/.test(queryId)) {
        return queryId;
    }
    return "anonymous";
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
        }
    });
}

export async function onRequest(context) {
    const { request, env, params } = context;
    const pathParts = params.path || [];
    const method = request.method.toUpperCase();
    const userId = getUserId(request);
    const db = env.DB;

    if (!db) {
        return jsonResponse({ error: "D1 database binding 'DB' is not configured." }, 500);
    }

    // List all sessions for the active user: GET /api/sessions
    if (pathParts.length === 0 && method === "GET") {
        const { results } = await db.prepare(
            "SELECT id, title, created_at, (summary IS NOT NULL AND length(summary) > 0) AS has_summary, user_id FROM sessions WHERE user_id = ? ORDER BY created_at DESC"
        ).bind(userId).all();

        return jsonResponse(results || []);
    }

    // Create or sync a session record: POST /api/sessions
    if (pathParts.length === 0 && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const id = (body.id || body.session_id || crypto.randomUUID()).trim();
        const title = (body.title || "").trim() || `Session ${id.slice(0, 8)}`;
        const createdAt = body.created_at || Math.floor(Date.now() / 1000);
        const provider = body.provider || "deepseek";
        const model = body.model || "";
        const systemPrompt = body.system_prompt || "";

        await db.prepare(
            "INSERT INTO sessions (id, user_id, title, created_at, provider, model, system_prompt) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, system_prompt = excluded.system_prompt"
        ).bind(id, userId, title, createdAt, provider, model, systemPrompt).run();

        return jsonResponse({
            session_id: id,
            title: title,
            created_at: createdAt
        });
    }

    const sessionId = pathParts[0];
    if (!sessionId || !/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)) {
        return jsonResponse({ error: "Invalid session ID format" }, 400);
    }

    // Get specific session details: GET /api/sessions/:id
    if (pathParts.length === 1 && method === "GET") {
        const row = await db.prepare(
            "SELECT * FROM sessions WHERE id = ? AND user_id = ?"
        ).bind(sessionId, userId).first();

        if (!row) {
            return jsonResponse({ error: "Session not found or access denied" }, 404);
        }

        let transcript = [];
        try {
            if (row.transcript) transcript = JSON.parse(row.transcript);
        } catch (e) {}

        return jsonResponse({
            id: row.id,
            title: row.title,
            system_prompt: row.system_prompt || "",
            summary: row.summary || "",
            transcript: transcript,
            created_at: row.created_at
        });
    }

    // Save/sync summary & transcript: POST /api/sessions/:id/summary
    if (pathParts.length === 2 && pathParts[1] === "summary" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const summary = body.summary || "";
        const transcript = typeof body.transcript === "string" ? body.transcript : JSON.stringify(body.transcript || []);
        
        await db.prepare(
            "UPDATE sessions SET summary = ?, transcript = ? WHERE id = ? AND user_id = ?"
        ).bind(summary, transcript, sessionId, userId).run();

        return jsonResponse({ status: "success", id: sessionId });
    }

    // Rename session: POST /api/sessions/:id/rename or PATCH /api/sessions/:id
    if ((pathParts.length === 2 && pathParts[1] === "rename" && method === "POST") ||
        (pathParts.length === 1 && method === "PATCH")) {
        const body = await request.json().catch(() => ({}));
        const newTitle = (body.title || "").trim().slice(0, 100);
        if (!newTitle) {
            return jsonResponse({ error: "Title cannot be empty" }, 400);
        }

        const res = await db.prepare(
            "UPDATE sessions SET title = ? WHERE id = ? AND user_id = ?"
        ).bind(newTitle, sessionId, userId).run();

        if (res.meta.changes === 0) {
            return jsonResponse({ error: "Session not found or access denied" }, 404);
        }

        return jsonResponse({ status: "success", id: sessionId, title: newTitle });
    }

    // Delete session: DELETE /api/sessions/:id
    if (pathParts.length === 1 && method === "DELETE") {
        const res = await db.prepare(
            "DELETE FROM sessions WHERE id = ? AND user_id = ?"
        ).bind(sessionId, userId).run();

        if (res.meta.changes === 0) {
            return jsonResponse({ error: "Session not found or access denied" }, 404);
        }

        return jsonResponse({ status: "success", id: sessionId });
    }

    return jsonResponse({ error: "Endpoint not found" }, 404);
}
