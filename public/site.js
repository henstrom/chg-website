/* Castle Horizon Group — shared behaviour
   Edit the LINKS block below to update external destinations across the whole site. */

const LINKS = {
  linkedinCompany: "",    // https://www.linkedin.com/company/...
  magnus: "https://www.linkedin.com/in/permagnusstrom/",
  marisa: "https://www.linkedin.com/in/marisa-mcgreevy-rose-mcmi-aiirsm-15055a2a/",
  rob: "https://www.linkedin.com/in/robert-clare-acib-mcbi-7315b414/",
  aksel: "https://www.linkedin.com/in/aksel-gundersen-25b998189/",
  henrik: "https://www.linkedin.com/in/henrik-strom-5a9a49345/",
  ulrik: "https://www.linkedin.com/in/ulrik-ferdinand-hansen-b3a4a7261/"
};

document.documentElement.classList.add("js");
const params = new URLSearchParams(location.search);

// External links: any element with data-link="key" gets its href from LINKS. An empty key hides the link.
document.querySelectorAll("[data-link]").forEach(el => {
  const url = LINKS[el.dataset.link];
  if (url) {
    el.setAttribute("href", url);
    if (/^https?:/.test(url)) { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); }
  } else {
    (el.closest("[data-link-wrap]") || el).hidden = true;
  }
});

// Referral code: ?ref=xyz on any page is remembered for the visit and sent with enquiries and NDA signatures
const ref = (params.get("ref") || params.get("REF") || "").trim().toLowerCase().slice(0, 60);
try { if (ref) sessionStorage.setItem("chg_ref", ref); } catch (e) {}
const storedRef = (() => { try { return sessionStorage.getItem("chg_ref") || ""; } catch (e) { return ""; } })();
document.querySelectorAll("input[name=ref]").forEach(el => el.value = ref || storedRef);

// Header: solid once scrolled
const header = document.querySelector(".header");
const setHeader = () => header && header.classList.toggle("solid", window.scrollY > 40);
setHeader();
window.addEventListener("scroll", setHeader, { passive: true });

// Mobile navigation
const burger = document.querySelector(".burger");
const nav = document.querySelector(".nav");
if (burger && nav) {
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  });
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
    nav.classList.remove("open"); burger.classList.remove("open"); document.body.style.overflow = "";
  }));
}

// Reveal on scroll (elements are visible at rest; this only adds a lift)
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
}

// Current year
document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

// Shared form plumbing
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
async function post(url, data) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(out.error || "Could not send");
  return out;
}

// Enquiry form
const form = document.getElementById("enquiry");
if (form) {
  const pre = params.get("interest");
  if (pre && form.elements.interest) form.elements.interest.value = pre;
  const status = form.querySelector(".status");
  const button = form.querySelector("button[type=submit]");

  // Extra questions only for portfolio enquiries
  const portfolioOnly = form.querySelectorAll(".portfolio-only");
  const syncPortfolio = () => portfolioOnly.forEach(el => el.hidden = form.elements.interest.value !== "portfolio");
  syncPortfolio();
  form.elements.interest.addEventListener("change", syncPortfolio);

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    status.classList.remove("err");
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name.trim() || !EMAIL_RE.test(data.email) || !data.message.trim()) {
      status.textContent = "Please give us your name, a valid email address and a short message.";
      status.classList.add("err");
      return;
    }
    button.disabled = true; status.textContent = "Sending…";
    try {
      await post("/api/enquiry", data);
      const next = data.interest === "portfolio"
        ? `<p>Your enquiry has reached our transaction adviser. If you have not yet signed the NDA, you can do so now and see the property schedule straight away.</p><a class="btn" href="nda.html">Sign the NDA <span class="arr"></span></a>`
        : `<p>Your enquiry has reached us. A principal will reply personally, usually within a day.</p>`;
      form.innerHTML = `<div class="done"><p class="eyebrow">Received</p><h3>Thank you, ${escapeHtml(data.name.split(" ")[0])}.</h3>${next}</div>`;
    } catch (e) {
      button.disabled = false;
      const subject = encodeURIComponent("Enquiry via chg.global — " + form.elements.interest.selectedOptions[0].text);
      const body = encodeURIComponent(`${data.message}\n\n${data.name}${data.organisation ? ", " + data.organisation : ""}\n${data.email}${data.phone ? "\n" + data.phone : ""}`);
      status.innerHTML = `${escapeHtml(e.message)}. You can <a href="mailto:hello@chg.global?subject=${subject}&body=${body}" style="color:var(--brass)">send it by email instead</a>.`;
      status.classList.add("err");
    }
  });
}

// NDA signature form
const nda = document.getElementById("nda");
if (nda) {
  if (params.get("next") === "details") { const n = document.getElementById("gateNote"); if (n) n.hidden = false; }
  const status = nda.querySelector(".status");
  const button = nda.querySelector("button[type=submit]");
  const stampEl = nda.querySelector("[data-stamp]");
  const fmt = d => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " at " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  const stamp = () => { if (stampEl) stampEl.textContent = fmt(new Date()); };
  stamp(); setInterval(stamp, 30000);

  nda.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    status.classList.remove("err");
    const fd = new FormData(nda);
    const data = Object.fromEntries(fd.entries());
    data.consent = fd.get("consent") === "agreed";
    const required = ["firstName", "lastName", "organisation", "jobTitle"];
    let problem = "";
    if (required.some(k => !String(data[k] || "").trim())) problem = "Please complete every field.";
    else if (!EMAIL_RE.test(data.email)) problem = "Please enter a valid email address.";
    else if (String(data.signature || "").trim().length < 3) problem = "Please type your full name as your signature.";
    else if (!data.consent) problem = "Please tick the box to confirm your agreement.";
    if (problem) { status.textContent = problem; status.classList.add("err"); return; }

    button.disabled = true; status.textContent = "Recording your signature…";
    try {
      const out = await post("/api/nda", data);
      nda.innerHTML = `<div class="done"><p class="eyebrow">Agreement signed</p><h3>Thank you, ${escapeHtml(data.firstName.trim())}.</h3>
        <p>Signed by <strong>${escapeHtml(out.signer)}</strong> on ${escapeHtml(out.signedDate)}. A copy of the agreement and a personal link to the property schedule have been sent to <strong>${escapeHtml(data.email)}</strong>. Robert Clare at Innovation Capital will countersign and send the information pack.</p>
        <a class="btn" href="${escapeHtml(out.url)}">View the property schedule <span class="arr"></span></a></div>`;
      nda.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      button.disabled = false;
      status.innerHTML = `${escapeHtml(e.message)}. If this persists, email <a href="mailto:robert.clare@innovationcapitalteam.com" style="color:var(--brass)">robert.clare@innovationcapitalteam.com</a>.`;
      status.classList.add("err");
    }
  });
}
