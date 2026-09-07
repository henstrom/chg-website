# chg.global — Castle Horizon Group website

Static site plus one small Worker for the enquiry form. No build step, no framework.

    ./
      wrangler.toml      Cloudflare config (Castle AgentIQ account, KV namespace already created)
      worker.js          POST /api/enquiry → KV (+ email via Resend if configured); everything else = static assets
      public/            the website
        index.html about.html portfolio.html privacy.html 404.html
        styles.css site.js img/
        magnus/          the QR business-card page → https://chg.global/magnus/

## Deploy

    cd <repo root>
    npx wrangler login          # once, in a browser
    npx wrangler deploy         # → https://chg-global.<subdomain>.workers.dev

Then: Cloudflare dashboard → Workers & Pages → chg-global → Settings → Domains & Routes → add `chg.global` and `www.chg.global`
(the zone must be on the same account; otherwise CNAME chg.global to the workers.dev hostname).

## Enquiry form

Works out of the box: every enquiry is stored in the `chg-enquiries` KV namespace.
To also receive them by email, verify chg.global at resend.com, then:

    npx wrangler secret put RESEND_API_KEY
    npx wrangler secret put ADMIN_KEY        # any long random string

Recipients: `ENQUIRY_TO` in wrangler.toml (comma-separated).
Stored enquiries: `https://chg.global/api/enquiries?key=<ADMIN_KEY>`.
If the endpoint ever fails, the form offers the visitor a pre-filled email to hello@chg.global instead.

## Links

All outbound links live in the `LINKS` block at the top of `public/site.js` (portfolio landing page, LinkedIn profiles).
An empty LinkedIn key hides that link; an empty portfolio key sends people to the enquiry form with "The portfolio" preselected.

## Business card

`public/magnus/index.html` — edit the `ME` block at the bottom. The QR code points at the page's own address when hosted.
