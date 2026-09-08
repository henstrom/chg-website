# chg.global — handover to Ulrik

Prepared for Castle Horizon Group, 7 September 2026. Magnus presents at IPS Dubai on 7–9 September, so the priority order is: **get it live → connect the domain → wire the enquiry email → fill in the links**.

Everything in this folder is the complete, working site. There is no build step and no framework: plain HTML, one stylesheet, one script, one small Cloudflare Worker for the enquiry form.

---

## 1. What is in the folder

    wrangler.toml            Cloudflare config — Worker name `chg-global`, Castle AgentIQ account, KV binding
    worker.js                Handles POST /api/enquiry (form) and GET /api/enquiries (admin). Everything else → static assets
    public/                  The website (served as static assets)
      index.html             Home: hero, group, four disciplines, buyers/sellers, portfolio plate, principles, contact + form
      about.html             Story, operating companies, leadership (7 people with portraits)
      portfolio.html         The portfolio teaser, matching the one-page PDF (noindex); links to the NDA and the PDF download
      nda.html               Non-disclosure agreement with typed e-signature → POST /api/nda (noindex)
      files/                 Vitae-Investments-Sussex-Portfolio.pdf — the downloadable teaser
    gated/                   NOT public. portfolio-details.html is the property schedule, served by the Worker at
                             /portfolio/details only to signed visitors; nda.txt is the agreement wording emailed to signers
      privacy.html           Privacy notice (noindex)
      404.html               Not-found page
      styles.css             All styling. Design tokens at the top (ink/navy/stone/parchment/brass; Cormorant Garamond + Jost via Google Fonts)
      site.js                Header, mobile nav, reveal-on-scroll, enquiry form, and the LINKS block (see §5)
      img/                   Photography (.jpg fallback, .webp default, -900.webp mobile hero), CHG marks, favicons
      img/team/              Seven portraits, navy duotone, 800×1000 (+ 400×500)
      magnus/                Magnus's QR business-card page → https://chg.global/magnus/
                             (index.html, magnus.jpg, Magnus-Strom.vcf)
    wallpaper-qr-card.jpg    Magnus's phone lock screen — the QR points at https://chg.global/magnus/
    README.md                Short technical notes
    HANDOVER.md              This file

---

## 2. Deploy (Cloudflare Workers with static assets)

**Automatic (preferred).** The Worker is connected to the GitHub repository `Castle-AgentIQ/chg-website` through
Cloudflare Workers Builds (dashboard → Workers & Pages → chg-global → Settings → Build). Production branch `main`,
no build command, deploy command `npx wrangler deploy`, root directory `/`. Merge to `main` → live in a minute or two;
pushes to other branches produce a preview URL. Each build and its log is listed on the Worker's Builds tab.

**Manual.** Prerequisite: Node 18+ and access to the **Castle AgentIQ** Cloudflare account (`ef0da64eebdb2d5184dd7007e0b757af`).

    cd <this folder>
    npx wrangler login          # once — opens a browser, log in to the Castle AgentIQ account
    npx wrangler deploy

Expected output ends with a URL like `https://chg-global.<subdomain>.workers.dev`. Open it and check:

- Home renders with the dusk terrace hero and the Cormorant/Jost type (fonts come from Google Fonts)
- /about, /portfolio, /magnus/ all load; "Save my contact" on /magnus/ downloads a vCard with the photo embedded
- Submit the enquiry form once with a test message — you should see the "Thank you" state

The KV namespace `chg-enquiries` (id `75c1b8577c374e82a7ed12004421094e`) already exists on the account and is bound in wrangler.toml, so the form works from the first deploy with no further setup.

---

## 3. Connect chg.global

We do not know where chg.global's DNS currently lives — it is not on either of our Cloudflare accounts' Worker lists. Two cases:

**A. The zone is (or can be moved to) the Castle AgentIQ Cloudflare account.**
Dashboard → Workers & Pages → chg-global → Settings → Domains & Routes → **Add → Custom domain** → `chg.global`, then again for `www.chg.global`. Cloudflare creates the DNS records and certificates itself. Done in ~2 minutes.

**B. DNS is elsewhere (registrar, Webflow, etc.).**
Either transfer the zone to Cloudflare (Add a site → chg.global → copy the two nameservers to the registrar; propagation up to 24h, usually much less), then do A. Or, as a stop-gap, set a CNAME for `www` to the `workers.dev` hostname and redirect the apex — but Workers custom domains need the zone on Cloudflare for the apex to work cleanly, so A is the target.

Also: `hello@chg.global` must keep working. If mail for the domain is on Google Workspace or similar, make sure the MX records come across when the zone moves (Cloudflare imports them automatically on "Add a site", but check).

The old site will be replaced the moment the domain points at the Worker. Keep a copy of it if anyone wants it — nothing in this folder depends on it.

---

## 4. Enquiry form — storage, email, admin

**Storage (works now).** Every submission is written to KV as `enq:<ISO timestamp>:<id>` with name, organisation, email, phone, interest (portfolio / selling / investing / other), office (sussex = Brighton / dubai / oslo), message, IP, country and referer. A honeypot field drops bots; each IP is limited to 5 submissions per hour.

**Email notification (recommended, ~15 min).** The Worker sends via Resend when a key is present:

1. resend.com → Domains → add `chg.global` → add the DNS records it shows (SPF/DKIM) → verify
2. resend.com → API Keys → create → copy
3. `npx wrangler secret put RESEND_API_KEY` (paste the key)
4. Recipients are in wrangler.toml `ENQUIRY_TO` (comma-separated). Currently `hello@chg.global`. Change and redeploy if Magnus wants it to go elsewhere / to several people.

The email arrives from `enquiries@chg.global` with reply-to set to the enquirer, subject `chg.global enquiry — <type> — <name>, <org>`.

**Admin read-out.** `npx wrangler secret put ADMIN_KEY` (any long random string). Then `https://chg.global/api/enquiries?key=<that string>` returns the last 100 enquiries as JSON, newest first. Useful even before Resend is set up — you can check submissions after the first day in Dubai.

**Fallback.** If the endpoint ever errors, the form shows the visitor a pre-filled `mailto:hello@chg.global` link with their message, so nothing is lost.

**Checking Resend is live.** `https://chg.global/api/health?key=<ADMIN_KEY>` reports whether the key is set. Every stored enquiry and NDA also carries a `mail` (or `mailAdviser` / `mailSigner`) field with `sent: true` or the error Resend returned, visible through `/api/enquiries` and `/api/ndas`.

---

## 5. The portfolio: teaser, NDA, schedule, pack

The former Innovation Capital site (innovationcapital.netlify.app) has been folded into chg.global and redirects here.

- **Public teaser** — `public/portfolio.html` is the one-page PDF as a web page, plus the PDF itself under `public/files/`. Keep it to what the PDF says: aggregate figures and towns, no addresses, no valuations, no rent or yield.
- **NDA** — `public/nda.html`. Same wording as the Innovation Capital agreement (Vitae Investments Ltd as disclosing party, Innovation Capital Ltd as adviser, two years, England and Wales). If the wording changes, change `gated/nda.txt` too (it is what gets emailed) and bump `NDA_VERSION` in worker.js. Signing stores `nda:<time>:<id>` in KV with name, signature, title, organisation, email, time, IP, country and user agent, emails `PORTFOLIO_TO` and the signer, and sets a 180-day cookie plus a personal link.
- **Property schedule** — `gated/portfolio-details.html`, served at `/portfolio/details` only with a valid token. Addresses, types, units, EPCs, council arrangement; deliberately no valuations. Unit counts are from the April 2026 schedule and should be refreshed from the rent roll.
- **Information pack** — Rob sends it outside the website after countersigning.
- **Recipients** — `PORTFOLIO_TO` in wrangler.toml (Rob, with Magnus copied) for portfolio enquiries and NDAs; `ENQUIRY_TO` (hello@) for everything else.
- **Referrals** — `?ref=code` on any link is carried into enquiries and NDA records.

LinkedIn URLs are in the `LINKS` block at the top of `public/site.js`; an empty key hides that person's link.

---

## 6. Content rules — please keep these

- **Portfolio anonymity, in tiers.** Public pages say only what the one-page teaser says: aggregate counts (15 freeholds, 182 homes), the towns, the lease, the councils, "twenty-million-pound-plus". No addresses, no per-property figures, no rent, guide price or yield. Addresses and unit counts sit behind the NDA at /portfolio/details. Money figures only go out in the information pack via Rob. The portfolio, NDA, schedule and card pages are all `noindex`.
- **Reason for sale** wording is deliberate: capital to fund nationwide expansion of adapted housing. Not retirement, not a pivot.
- **No numbers** on the group page either (the old site's "£30M / since 2018" were removed on purpose; founding year is 2019).
- **Structure wording.** Share sale of Vitae Investments Ltd. Not "share or asset sale", not a joint venture — the April Innovation Capital site said those and it was out of date.
- **People.** Seven portraits, all in the same navy duotone (`img/team/`), shown only on the People page (about.html). If someone's photo is replaced, run it through the same treatment — 4:5 crop, face at ~42% from top, greyscale → autocontrast → duotone from #0B1622 through #546880 to #ECE5D8. Ask Lumo/Claude for the script if needed.
- **Offices.** Brighton (HQ; address 6 Windsor Road, Worthing BN11 2LX), Dubai (+971 58 291 6623), Oslo (+47 911 92 082). Phone numbers only for Dubai and Oslo — no addresses.

---

## 7. The business card page (/magnus/)

Self-contained page; everything editable is in the `ME` object at the bottom of `public/magnus/index.html` (name, title, phone, email, LinkedIn, portfolio URL, tagline, and the message templates: `whatsappText` pre-fills the WhatsApp message, `emailSubject` the email subject, `shareText` the text sent with "Share this card"). The Share button opens the phone's native share sheet; on a browser without one it copies the card's link. "Save my contact" generates a vCard in the browser, with a 240×240 JPEG of the portrait embedded (the `PHOTO` constant just below `ME`) so the contact lands on the phone with a picture. The same vCard is also committed as `Magnus-Strom.vcf`. The page itself has no QR code; Magnus's phone wallpaper QR points at `https://chg.global/magnus/`, so the page must exist at exactly that path — it does, as `public/magnus/index.html`.

---

## 8. Nice-to-haves once live (not needed for Dubai)

- Add `www.chg.global` → `chg.global` redirect rule (Cloudflare Rules → Redirect) so one canonical host
- Submit the sitemap / check Google Search Console; only index, about and privacy should be indexed
- Consider Cloudflare Web Analytics (privacy-friendly, no cookies; the privacy notice already says no analytics cookies)
- Replace `hello@chg.global` on the contact section with a form-only route if spam becomes a problem

Questions: Magnus, or Lumo (Claude) via Magnus's Cowork session which has the full build history.
