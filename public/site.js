/* Castle Horizon Group — shared behaviour
   Edit the LINKS block below to update external destinations across the whole site. */

const LINKS = {
  portfolio: "",          // Portfolio enquiry landing page — paste the full URL here (empty = opens the enquiry form)
  linkedinCompany: "",    // https://www.linkedin.com/company/...
  magnus: "https://www.linkedin.com/in/permagnusstrom/",
  aksana: "",
  marisa: "https://www.linkedin.com/in/marisa-mcgreevy-rose-mcmi-aiirsm-15055a2a/",
  rob: "https://www.linkedin.com/in/robert-clare-acib-mcbi-7315b414/",
  aksel: "https://www.linkedin.com/in/aksel-gundersen-25b998189/",
  henrik: "https://www.linkedin.com/in/henrik-strom-5a9a49345/",
  ulrik: "https://www.linkedin.com/in/ulrik-ferdinand-hansen-b3a4a7261/"
};
const PEOPLE_KEYS = ["magnus", "aksana", "marisa", "rob", "aksel", "henrik", "ulrik", "linkedinCompany"];

document.documentElement.classList.add("js");

// External links: any element with data-link="key" gets its href from LINKS.
// Empty LinkedIn keys hide the link; an empty portfolio key sends people to the enquiry form with "The portfolio" preselected.
const onHome = /(^|\/)(index\.html)?$/.test(location.pathname) || document.getElementById("enquiry");
document.querySelectorAll("[data-link]").forEach(el => {
  const key = el.dataset.link;
  const url = LINKS[key];
  if (url) {
    el.setAttribute("href", url);
    if (/^https?:/.test(url)) { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); }
  } else if (PEOPLE_KEYS.includes(key)) {
    (el.closest('[data-link-wrap]') || el).hidden = true;
  } else if (key === "portfolio") {
    el.setAttribute("href", (onHome ? "" : "index.html") + "?interest=portfolio#contact");
  }
});

// Header: solid once scrolled
const header = document.querySelector(".header");
const setHeader = () => header.classList.toggle("solid", window.scrollY > 40);
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

// Enquiry form
const form = document.getElementById("enquiry");
if (form) {
  const params = new URLSearchParams(location.search);
  const pre = params.get("interest");
  if (pre && form.elements.interest) form.elements.interest.value = pre;
  const status = form.querySelector(".status");
  const button = form.querySelector("button[type=submit]");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    status.classList.remove("err");
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email) || !data.message.trim()) {
      status.textContent = "Please give us your name, a valid email address and a short message.";
      status.classList.add("err");
      return;
    }
    button.disabled = true; status.textContent = "Sending…";
    try {
      const res = await fetch("/api/enquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.error || "Could not send");
      form.innerHTML = `<div class="done"><p class="eyebrow">Received</p><h3>Thank you, ${escapeHtml(data.name.split(" ")[0])}.</h3><p>Your enquiry has reached us. A principal will reply personally, usually within a day.</p></div>`;
    } catch (e) {
      button.disabled = false;
      const subject = encodeURIComponent("Enquiry via chg.global — " + form.elements.interest.selectedOptions[0].text);
      const body = encodeURIComponent(`${data.message}\n\n${data.name}${data.organisation ? ", " + data.organisation : ""}\n${data.email}${data.phone ? "\n" + data.phone : ""}`);
      status.innerHTML = `${escapeHtml(e.message)}. You can <a href="mailto:hello@chg.global?subject=${subject}&body=${body}" style="color:var(--brass)">send it by email instead</a>.`;
      status.classList.add("err");
    }
  });
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
