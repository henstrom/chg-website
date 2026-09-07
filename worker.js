/* Castle Horizon Group — chg.global
   Static assets are served by Cloudflare; this Worker only handles the enquiry form.

   POST /api/enquiry   { name, organisation, email, phone, interest, office, message, website(honeypot) }
     → stored in KV (ENQUIRIES), emailed via Resend when RESEND_API_KEY is set
   GET  /api/enquiries?key=ADMIN_KEY   → last 100 enquiries as JSON (set ADMIN_KEY with `wrangler secret put ADMIN_KEY`)
*/

const ALLOWED_INTEREST = new Set(["portfolio", "selling", "investing", "other"]);
const ALLOWED_OFFICE = new Set(["sussex", "dubai", "oslo"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/enquiry" && request.method === "POST") {
      return handleEnquiry(request, env);
    }
    if (url.pathname === "/api/enquiries" && request.method === "GET") {
      if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY) return json({ error: "unauthorised" }, 401);
      const list = await env.ENQUIRIES.list({ prefix: "enq:", limit: 100 });
      const items = await Promise.all(list.keys.reverse().map(k => env.ENQUIRIES.get(k.name, "json")));
      return json(items);
    }
    // Everything else: static assets
    return env.ASSETS.fetch(request);
  }
};

async function handleEnquiry(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }

  // Honeypot — bots fill the hidden "website" field
  if (body.website) return json({ ok: true });

  const clean = s => String(s || "").trim().slice(0, 2000);
  const enquiry = {
    name: clean(body.name),
    organisation: clean(body.organisation),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    interest: ALLOWED_INTEREST.has(body.interest) ? body.interest : "other",
    office: ALLOWED_OFFICE.has(body.office) ? body.office : "sussex",
    message: clean(body.message),
    received: new Date().toISOString(),
    ip: request.headers.get("cf-connecting-ip") || "",
    country: request.headers.get("cf-ipcountry") || "",
    referer: request.headers.get("referer") || ""
  };
  if (!enquiry.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(enquiry.email) || !enquiry.message) {
    return json({ error: "Please give us your name, a valid email address and a short message." }, 400);
  }

  // Simple per-IP rate limit: 5 per hour
  const rlKey = `rl:${enquiry.ip}`;
  const count = Number(await env.ENQUIRIES.get(rlKey)) || 0;
  if (count >= 5) return json({ error: "Too many messages from this connection. Please email us directly." }, 429);
  await env.ENQUIRIES.put(rlKey, String(count + 1), { expirationTtl: 3600 });

  const id = `enq:${enquiry.received}:${crypto.randomUUID().slice(0, 8)}`;
  await env.ENQUIRIES.put(id, JSON.stringify(enquiry));

  if (env.RESEND_API_KEY) {
    const to = (env.ENQUIRY_TO || "hello@chg.global").split(",").map(s => s.trim());
    const label = { portfolio: "Portfolio", selling: "Selling", investing: "Investing", other: "General" }[enquiry.interest];
    const office = { sussex: "Brighton", dubai: "Dubai", oslo: "Oslo" }[enquiry.office];
    const text =
`New enquiry via chg.global — ${label} (${office})

Name:          ${enquiry.name}
Organisation:  ${enquiry.organisation || "—"}
Email:         ${enquiry.email}
Phone:         ${enquiry.phone || "—"}
Country:       ${enquiry.country}

${enquiry.message}

Received ${enquiry.received}`;
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.ENQUIRY_FROM || "Castle Horizon Group <enquiries@chg.global>",
          to,
          reply_to: enquiry.email,
          subject: `chg.global enquiry — ${label} — ${enquiry.name}${enquiry.organisation ? ", " + enquiry.organisation : ""}`,
          text
        })
      });
    } catch (e) { /* stored in KV regardless */ }
  }
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
