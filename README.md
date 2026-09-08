# chg.global — Castle Horizon Group website

Static site plus one small Worker for the enquiry form. No build step, no framework.

    ./
      wrangler.toml      Cloudflare config (Castle AgentIQ account, KV namespace already created)
      worker.js          Forms, NDA signing and the NDA-gated property schedule; everything else = static assets
      gated/             Served only by the Worker: portfolio-details.html (the property schedule) and nda.txt (agreement wording for emails)
      public/            the website
        index.html about.html portfolio.html nda.html privacy.html 404.html
        styles.css site.js img/ files/ (the portfolio teaser PDF)
        magnus/          the business-card page → https://chg.global/magnus/

## Deploy

Automatic: the Worker is connected to this GitHub repository through Cloudflare Workers Builds
(Cloudflare dashboard → Workers & Pages → chg-global → Settings → Build). Every push to `main` runs `npx wrangler deploy`
on Cloudflare's side and the site updates within a minute or two; other branches get a preview URL. Build history and
logs are under the Worker's "Deployments" and "Builds" tabs.

Manual, if ever needed:

    cd <repo root>
    npx wrangler login          # once, in a browser
    npx wrangler deploy         # → https://chg-global.<subdomain>.workers.dev

Then: Cloudflare dashboard → Workers & Pages → chg-global → Settings → Domains & Routes → add `chg.global` and `www.chg.global`
(the zone must be on the same account; otherwise CNAME chg.global to the workers.dev hostname).

## Enquiry form, NDA and the portfolio

The portfolio is presented in three tiers:

1. **Public** — `portfolio.html` carries the content of the one-page teaser (aggregate figures, towns, lease, process) and a
   download of the PDF in `public/files/`. No addresses, valuations, rent or yield.
2. **Under NDA** — `nda.html` is the agreement with a typed e-signature. Signing posts to `POST /api/nda`, which stores the
   record in KV, emails the adviser and the signer (with the agreement text from `gated/nda.txt`), sets a cookie and
   returns a personal link. `/portfolio/details` is then served by the Worker from `gated/portfolio-details.html`; anyone
   without a valid token is redirected to `/nda`. Access lasts 180 days. The schedule shows addresses, types, units and
   EPCs but no valuations.
3. **Information pack** — rent, guide price, yield and financials, sent by Innovation Capital outside the website.

Enquiries (`POST /api/enquiry`) are stored in KV. Portfolio enquiries (interest = "The portfolio", with the extra
investor-type and interest-in questions) go to `PORTFOLIO_TO`; everything else to `ENQUIRY_TO`. Both are in wrangler.toml.
A `?ref=code` on any URL is remembered for the visit and attached to enquiries and NDA signatures as `ref`.

Email needs the Resend key; without it, forms still work and records still store, with the send error kept on the record:

    npx wrangler secret put RESEND_API_KEY
    npx wrangler secret put ADMIN_KEY        # any long random string

Admin (JSON, newest first): `/api/enquiries?key=…`, `/api/ndas?key=…`, and `/api/health?key=…` to see whether Resend is configured.
If the enquiry endpoint ever fails, the form offers the visitor a pre-filled email to hello@chg.global instead.

## Links

LinkedIn URLs live in the `LINKS` block at the top of `public/site.js`. An empty key hides that link.

## Business card

`public/magnus/index.html` — edit the `ME` block at the bottom (contact details plus the WhatsApp/email/share message templates). "Save my contact" builds a vCard in the browser with the portrait embedded (the `PHOTO` constant, a 240×240 JPEG as base64); `Magnus-Strom.vcf` alongside it is the same card as a file.
