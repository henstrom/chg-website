/* Castle Horizon Group — chg.global
   Static assets are served by Cloudflare; this Worker handles the forms and the NDA-gated portfolio schedule.

   POST /api/enquiry        { name, organisation, email, phone, interest, office, message, investorType, interestIn, ref, website(honeypot) }
                            → stored in KV (enq:*), emailed via Resend. Portfolio enquiries go to PORTFOLIO_TO, the rest to ENQUIRY_TO.
   POST /api/nda            { firstName, lastName, organisation, jobTitle, email, signature, consent, ref, website(honeypot) }
                            → stored in KV (nda:*), emailed to PORTFOLIO_TO and to the signer; issues an access token (cookie + link)
   GET  /portfolio/details  → the property schedule, served only with a valid token (cookie or ?t=); otherwise redirects to /nda
   GET  /api/enquiries?key=ADMIN_KEY   → last 100 enquiries as JSON
   GET  /api/ndas?key=ADMIN_KEY        → last 100 signed NDAs as JSON
   GET  /api/health?key=ADMIN_KEY      → which integrations are configured (no secret values)
*/

import detailsHtml from "./gated/portfolio-details.html";
import ndaText from "./gated/nda.txt";

const ALLOWED_INTEREST = new Set(["portfolio", "selling", "investing", "other"]);
const ALLOWED_OFFICE = new Set(["sussex", "dubai", "oslo"]);
const ALLOWED_INVESTOR = new Set(["institutional", "pe-family-office", "propco-reit", "hnwi", "housing-provider", "other"]);
const ALLOWED_INTEREST_IN = new Set(["acquire", "finance", "undecided"]);
const INTEREST_LABEL = { portfolio: "Portfolio", selling: "Selling", investing: "Investing", other: "General" };
const OFFICE_LABEL = { sussex: "Brighton", dubai: "Dubai", oslo: "Oslo" };
const INVESTOR_LABEL = { institutional: "Institutional investor / fund", "pe-family-office": "Private equity / family office", "propco-reit": "Property company / REIT", hnwi: "High-net-worth individual", "housing-provider": "Social housing provider", other: "Other" };
const INTEREST_IN_LABEL = { acquire: "Acquiring the portfolio", finance: "Co-investment or financing", undecided: "Not yet decided" };

const NDA_VERSION = "2026-09";
const TOKEN_TTL = 60 * 60 * 24 * 180;   // access to the schedule lasts 180 days from signing
const COOKIE = "chg_nda";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const get = request.method === "GET", post = request.method === "POST";

    if (pathname === "/api/enquiry" && post) return handleEnquiry(request, env);
    if (pathname === "/api/nda" && post) return handleNda(request, env, url);
    if (pathname === "/portfolio/details") return handleDetails(request, env, url);
    if (pathname === "/api/enquiries" && get) return adminList(env, url, "enq:");
    if (pathname === "/api/ndas" && get) return adminList(env, url, "nda:");
    if (pathname === "/api/health" && get) {
      if (!isAdmin(env, url)) return json({ error: "unauthorised" }, 401);
      return json({
        resendConfigured: Boolean(env.RESEND_API_KEY),
        enquiryTo: recipients(env.ENQUIRY_TO), portfolioTo: recipients(env.PORTFOLIO_TO),
        from: env.ENQUIRY_FROM || null, ndaVersion: NDA_VERSION
      });
    }
    // Everything else: static assets
    return env.ASSETS.fetch(request);
  }
};

/* ---------- enquiry form ---------- */

async function handleEnquiry(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid request." }, 400);
  if (body.website) return json({ ok: true });            // honeypot

  const enquiry = {
    name: clean(body.name),
    organisation: clean(body.organisation),
    email: clean(body.email).toLowerCase(),
    phone: clean(body.phone),
    interest: ALLOWED_INTEREST.has(body.interest) ? body.interest : "other",
    office: ALLOWED_OFFICE.has(body.office) ? body.office : "sussex",
    investorType: ALLOWED_INVESTOR.has(body.investorType) ? body.investorType : "",
    interestIn: ALLOWED_INTEREST_IN.has(body.interestIn) ? body.interestIn : "",
    ref: clean(body.ref, 60),
    message: clean(body.message),
    received: new Date().toISOString(),
    ...requestMeta(request)
  };
  if (!enquiry.name || !EMAIL_RE.test(enquiry.email) || !enquiry.message) {
    return json({ error: "Please give us your name, a valid email address and a short message." }, 400);
  }
  if (await rateLimited(env, "rl:" + enquiry.ip)) {
    return json({ error: "Too many messages from this connection. Please email us directly." }, 429);
  }

  const portfolio = enquiry.interest === "portfolio";
  const to = recipients(portfolio ? env.PORTFOLIO_TO : env.ENQUIRY_TO, "hello@chg.global");
  const text =
`New enquiry via chg.global — ${INTEREST_LABEL[enquiry.interest]} (${OFFICE_LABEL[enquiry.office]})

Name:          ${enquiry.name}
Organisation:  ${enquiry.organisation || "—"}
Email:         ${enquiry.email}
Phone:         ${enquiry.phone || "—"}
Country:       ${enquiry.country || "—"}${portfolio ? `
Investor type: ${INVESTOR_LABEL[enquiry.investorType] || "—"}
Interest in:   ${INTEREST_IN_LABEL[enquiry.interestIn] || "—"}` : ""}${enquiry.ref ? `
Referred by:   ${enquiry.ref}` : ""}

${enquiry.message}

Received ${enquiry.received}`;

  enquiry.mail = await sendMail(env, {
    to, replyTo: enquiry.email,
    subject: `chg.global enquiry — ${INTEREST_LABEL[enquiry.interest]} — ${enquiry.name}${enquiry.organisation ? ", " + enquiry.organisation : ""}`,
    text
  });

  await env.ENQUIRIES.put(`enq:${enquiry.received}:${shortId()}`, JSON.stringify(enquiry));
  return json({ ok: true });
}

/* ---------- NDA signature ---------- */

async function handleNda(request, env, url) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid request." }, 400);
  if (body.website) return json({ ok: true });            // honeypot

  const nda = {
    firstName: clean(body.firstName, 100),
    lastName: clean(body.lastName, 100),
    organisation: clean(body.organisation, 200),
    jobTitle: clean(body.jobTitle, 200),
    email: clean(body.email).toLowerCase(),
    signature: clean(body.signature, 200),
    consent: body.consent === true,
    ref: clean(body.ref, 60),
    ndaVersion: NDA_VERSION,
    signedAt: new Date().toISOString(),
    ...requestMeta(request),
    userAgent: clean(request.headers.get("user-agent"), 300)
  };
  if (!nda.firstName || !nda.lastName || !nda.organisation || !nda.jobTitle || !EMAIL_RE.test(nda.email)) {
    return json({ error: "Please complete every field." }, 400);
  }
  if (nda.signature.length < 3) return json({ error: "Please type your full name as your signature." }, 400);
  if (!nda.consent) return json({ error: "Please tick the box to confirm your agreement." }, 400);
  if (await rateLimited(env, "rl:nda:" + nda.ip)) {
    return json({ error: "Too many submissions from this connection. Please email robert.clare@innovationcapitalteam.com." }, 429);
  }

  const id = `nda:${nda.signedAt}:${shortId()}`;
  const token = crypto.randomUUID().replace(/-/g, "") + shortId();
  const signer = `${nda.firstName} ${nda.lastName}`;
  const signedDate = new Date(nda.signedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" }) + " (UK time)";
  const accessLink = `${env.SITE_URL || url.origin}/portfolio/details?t=${token}`;
  const to = recipients(env.PORTFOLIO_TO, "hello@chg.global");

  const record =
`Signed by:     ${signer}
Signature:     ${nda.signature}
Title:         ${nda.jobTitle}
Organisation:  ${nda.organisation}
Email:         ${nda.email}
Signed:        ${signedDate}  ·  ${nda.signedAt}
IP / country:  ${nda.ip || "—"} / ${nda.country || "—"}${nda.ref ? `
Referred by:   ${nda.ref}` : ""}
Agreement:     version ${NDA_VERSION}, chg.global/nda`;

  nda.mailAdviser = await sendMail(env, {
    to, replyTo: nda.email,
    subject: `NDA signed — Vitae portfolio — ${signer}, ${nda.organisation}`,
    text:
`A non-disclosure agreement has been signed on chg.global.

${record}

The signatory now has access to the property schedule at chg.global/portfolio/details and has been told the information pack will follow from Innovation Capital.

---------------------------------------------------------------
${ndaText}`
  });

  nda.mailSigner = await sendMail(env, {
    to: [nda.email], replyTo: to[0],
    subject: "Your signed NDA — Vitae Investments, Sussex portfolio",
    text:
`Dear ${nda.firstName},

Thank you. Your non-disclosure agreement with Vitae Investments Ltd has been signed and recorded.

${record}

The property schedule is available to you here (this link is personal to you and stays valid for 180 days):
${accessLink}

Robert Clare of Innovation Capital Ltd, the transaction adviser, will countersign the agreement and send you the information pack, including rent, guide price and yield.

Robert Clare ACIB MCBI  ·  robert.clare@innovationcapitalteam.com  ·  +44 7788 428 077
Magnus Strøm, Founder and Director, Vitae Investments Ltd  ·  magnus@chg.global  ·  +971 58 291 6623

The agreement you signed is reproduced below for your records.

---------------------------------------------------------------
${ndaText}`
  });

  await env.ENQUIRIES.put(id, JSON.stringify(nda));
  await env.ENQUIRIES.put(`tok:${token}`, JSON.stringify({ nda: id, email: nda.email, name: signer }), { expirationTtl: TOKEN_TTL });

  return json({ ok: true, url: "/portfolio/details", link: accessLink, signer, signedDate }, 200, {
    "Set-Cookie": cookie(token, TOKEN_TTL)
  });
}

/* ---------- gated property schedule ---------- */

async function handleDetails(request, env, url) {
  const fromLink = url.searchParams.get("t");
  const token = fromLink || readCookie(request, COOKIE);
  const grant = token ? await env.ENQUIRIES.get(`tok:${token}`, "json") : null;

  if (!grant) {
    return new Response(null, { status: 302, headers: { Location: "/nda?next=details", "Cache-Control": "no-store" } });
  }
  if (fromLink) {
    // Personal link from the email: set the cookie and show the clean address
    return new Response(null, { status: 302, headers: { Location: "/portfolio/details", "Set-Cookie": cookie(token, TOKEN_TTL), "Cache-Control": "no-store" } });
  }
  return new Response(detailsHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer"
    }
  });
}

/* ---------- admin ---------- */

async function adminList(env, url, prefix) {
  if (!isAdmin(env, url)) return json({ error: "unauthorised" }, 401);
  const list = await env.ENQUIRIES.list({ prefix, limit: 100 });
  const items = await Promise.all(list.keys.reverse().map(k => env.ENQUIRIES.get(k.name, "json")));
  return json(items);
}
function isAdmin(env, url) { return Boolean(env.ADMIN_KEY) && url.searchParams.get("key") === env.ADMIN_KEY; }

/* ---------- helpers ---------- */

async function sendMail(env, { to, subject, text, replyTo }) {
  if (!env.RESEND_API_KEY) return { sent: false, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.ENQUIRY_FROM || "Castle Horizon Group <enquiries@chg.global>", to, reply_to: replyTo, subject, text })
    });
    if (res.ok) return { sent: true };
    return { sent: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
  } catch (e) {
    return { sent: false, error: String(e && e.message || e) };   // stored in KV regardless
  }
}

async function rateLimited(env, key, limit = 5) {
  const count = Number(await env.ENQUIRIES.get(key)) || 0;
  if (count >= limit) return true;
  await env.ENQUIRIES.put(key, String(count + 1), { expirationTtl: 3600 });
  return false;
}

function recipients(value, fallback) {
  const list = String(value || "").split(",").map(s => s.trim()).filter(Boolean);
  return list.length ? list : (fallback ? [fallback] : []);
}
function requestMeta(request) {
  return {
    ip: request.headers.get("cf-connecting-ip") || "",
    country: request.headers.get("cf-ipcountry") || "",
    referer: request.headers.get("referer") || ""
  };
}
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function clean(s, max = 2000) { return String(s || "").trim().slice(0, max); }
function shortId() { return crypto.randomUUID().slice(0, 8); }
function cookie(token, maxAge) { return `${COOKIE}=${token}; Path=/portfolio; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }
function readCookie(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
}
