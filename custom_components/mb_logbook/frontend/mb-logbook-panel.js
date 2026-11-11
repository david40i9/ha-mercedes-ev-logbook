/* Mercedes EV Logbook sidebar page: an overview (month figures, 12-month charts, this
 * month's routes, most-visited places) and the full logbook card.
 * Charts are plain HTML and CSS and the map is Home Assistant's own <ha-map>; nothing
 * is loaded from outside Home Assistant. */

const KM_PER_MI = 1.609344;
const ROUTE_COLOURS = ["#89b4fa", "#a6e3a1", "#fab387", "#cba6f7", "#f9e2af", "#94e2d5", "#f38ba8", "#74c7ec"];

// Material Design Icons paths, drawn inline (as in the card).
const PICONS = {
  left: "M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z",
  right: "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z",
  car: "M5,11L6.5,6.5H17.5L19,11M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M18.92,6C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.28,5.42 5.08,6L3,12V20A1,1 0 0,0 4,21H5A1,1 0 0,0 6,20V19H18V20A1,1 0 0,0 19,21H20A1,1 0 0,0 21,20V12L18.92,6Z",
  distance: "M6.5,8.11C5.61,8.11 4.89,7.39 4.89,6.5A1.61,1.61 0 0,1 6.5,4.89C7.39,4.89 8.11,5.61 8.11,6.5V6.5A1.61,1.61 0 0,1 6.5,8.11M6.5,2C4,2 2,4 2,6.5C2,9.87 6.5,14.86 6.5,14.86C6.5,14.86 11,9.87 11,6.5C11,4 9,2 6.5,2M17.5,8.11A1.61,1.61 0 0,1 15.89,6.5C15.89,5.61 16.61,4.89 17.5,4.89C18.39,4.89 19.11,5.61 19.11,6.5A1.61,1.61 0 0,1 17.5,8.11M17.5,2C15,2 13,4 13,6.5C13,9.87 17.5,14.86 17.5,14.86C17.5,14.86 22,9.87 22,6.5C22,4 20,2 17.5,2M17.5,16C16.23,16 15.1,16.8 14.68,18H9.32C8.77,16.44 7.05,15.62 5.5,16.17C3.93,16.72 3.11,18.44 3.66,20C4.22,21.56 5.93,22.38 7.5,21.83C8.35,21.53 9,20.85 9.32,20H14.69C15.24,21.56 16.96,22.38 18.5,21.83C20.08,21.28 20.9,19.56 20.35,18C19.92,16.8 18.78,16 17.5,16V16M17.5,20.5A1.5,1.5 0 0,1 16,19A1.5,1.5 0 0,1 17.5,17.5A1.5,1.5 0 0,1 19,19A1.5,1.5 0 0,1 17.5,20.5Z",
  bolt: "M11 15H6L13 1V9H18L11 23V15Z",
  eff: "M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z",
  station: "M19.77,7.23L19.78,7.22L16.06,3.5L15,4.56L17.11,6.67C16.17,7.03 15.5,7.93 15.5,9A2.5,2.5 0 0,0 18,11.5C18.36,11.5 18.69,11.42 19,11.29V18.5A1,1 0 0,1 18,19.5A1,1 0 0,1 17,18.5V14A2,2 0 0,0 15,12H14V5A2,2 0 0,0 12,3H6A2,2 0 0,0 4,5V21H14V13.5H15.5V18.5A2.5,2.5 0 0,0 18,21A2.5,2.5 0 0,0 20.5,18.5V9C20.5,8.31 20.22,7.68 19.77,7.23M18,10A1,1 0 0,1 17,9A1,1 0 0,1 18,8A1,1 0 0,1 19,9A1,1 0 0,1 18,10M8,18V13.5H6L10,6V11H12L8,18Z",
  cash: "M5,6H23V18H5V6M14,9A3,3 0 0,1 17,12A3,3 0 0,1 14,15A3,3 0 0,1 11,12A3,3 0 0,1 14,9M9,8A2,2 0 0,1 7,10V14A2,2 0 0,1 9,16H19A2,2 0 0,1 21,14V10A2,2 0 0,1 19,8H9M1,10H3V20H19V22H1V10Z",
  drain: "M18 9.29V5.33C18 4.6 17.4 4 16.67 4H15V2H9V4H7.33C6.6 4 6 4.6 6 5.33V20.67C6 21.4 6.6 22 7.33 22H12.41C13.46 22.63 14.69 23 16 23C19.87 23 23 19.87 23 16C23 12.83 20.89 10.15 18 9.29M8 6H16V9C12.13 9 9 12.13 9 16C9 17.5 9.47 18.87 10.26 20H8V6M16 21C13.24 21 11 18.76 11 16S13.24 11 16 11 21 13.24 21 16 18.76 21 16 21M16.5 16.25L19.36 17.94L18.61 19.16L15 17V12H16.5V16.25Z",
  upright: "M5,17.59L15.59,7H9V5H19V15H17V8.41L6.41,19L5,17.59Z",
  downright: "M5,6.41L6.41,5L17,15.59V9H19V19H9V17H15.59L5,6.41Z",
};
const picon = (name, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PICONS[name]}"/></svg>`;
// Chart and label colours are CSS variables with a light and a dark step (see the css below).
// Labels keep a fixed slot, the same as on the card.
const LABEL_SLOTS = { Business: 1, Commute: 2, Personal: 3 };

const escp = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class MBLogbookPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._view = "overview";
    this._mPeriod = "month"; // mileage-by-label period
    this._mOffset = 0;
    this._hPeriod = "year"; // heat map period
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._card) this._card.hass = hass;
    if (this._map) this._map.hass = hass;
    if (this._menu) this._menu.hass = hass;
    this.toggleAttribute("dark", !!hass.themes?.darkMode);
    if (first) this._init();
  }

  set narrow(v) {
    this._narrow = v;
    if (this._menu) this._menu.narrow = v;
  }

  set panel(p) {
    this._panel = p;
  }

  async _init() {
    // Make sure the logbook card is defined (same URL as the dashboard resource).
    const url = this._panel?.config?.card_url;
    if (url && !customElements.get("mb-logbook-card")) {
      try {
        await import(url);
      } catch (e) {
        /* the card tab will say so */
      }
    }
    // Right after a restart the integration may not be ready yet: retry a few times.
    this._cars = [];
    for (let i = 0; i < 6 && !this._cars.length; i++) {
      try {
        this._cars = await this._hass.callWS({ type: "mb_logbook/cars" });
      } catch (e) {
        this._cars = [];
      }
      if (!this._cars.length) await new Promise((r) => setTimeout(r, 2000));
    }
    this._car = this._cars[0] || null;
    this._render();
    if (this._car) this._loadOverview();
  }

  get _miles() {
    return this._car?.unit === "mi";
  }

  _d(km, digits = 0) {
    return (this._miles ? km / KM_PER_MI : km).toFixed(digits);
  }

  get _du() {
    return this._miles ? "mi" : "km";
  }

  _eff(km, kwh) {
    if (!km || !kwh) return null;
    return this._miles ? km / KM_PER_MI / kwh : (kwh / km) * 100;
  }

  get _effUnit() {
    return this._miles ? "mi/kWh" : "kWh/100km";
  }

  /** whole: no decimals (chart labels, where 12 bars share the width). */
  _money(v, whole = false) {
    try {
      return new Intl.NumberFormat(this._hass.locale?.language, {
        style: "currency",
        currency: this._car?.currency || this._hass.config.currency || "EUR",
        ...(whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}),
      }).format(v);
    } catch (e) {
      return v.toFixed(2);
    }
  }

  _monthName(key, long = false) {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString(this._hass.locale?.language, { month: long ? "long" : "short" });
  }

  // ----- layout ----------------------------------------------------------------------

  _render() {
    const root = this.shadowRoot;
    const cars =
      this._cars.length > 1
        ? `<div class=seg>${this._cars
            .map((c) => `<button data-car="${c.entry_id}" class="${c.entry_id === this._car?.entry_id ? "on" : ""}">${escp(c.name)}</button>`)
            .join("")}</div>`
        : "";
    const views = `<div class=seg>${[["overview", "Overview"], ["logbook", "Logbook"]]
      .map(([v, l]) => `<button data-view="${v}" class="${v === this._view ? "on" : ""}">${l}</button>`)
      .join("")}</div>`;
    root.innerHTML = `<style>${MBLogbookPanel.css}</style>
      <div class=toolbar><span id=menu></span><div class=apptitle>Mercedes EV Logbook${this._car ? ` · ${escp(this._car.name)}` : ""}</div>${cars}${views}</div>
      <div class=content id=content>${this._car ? "" : `<div class=empty>No cars set up yet. Add one under Settings → Devices &amp; services → Mercedes EV Logbook.</div>`}</div>`;

    this._menu = document.createElement("ha-menu-button");
    this._menu.hass = this._hass;
    this._menu.narrow = this._narrow;
    root.getElementById("menu").appendChild(this._menu);

    root.querySelectorAll("button[data-car]").forEach((b) =>
      b.addEventListener("click", () => {
        this._car = this._cars.find((c) => c.entry_id === b.dataset.car);
        this._render();
        this._view === "overview" ? this._loadOverview() : this._showLogbook();
      })
    );
    root.querySelectorAll("button[data-view]").forEach((b) =>
      b.addEventListener("click", () => {
        this._view = b.dataset.view;
        this._render();
        this._view === "overview" ? this._loadOverview() : this._showLogbook();
      })
    );
    if (this._car && this._view === "logbook") this._showLogbook();
  }

  _showLogbook() {
    const box = this.shadowRoot.getElementById("content");
    if (!this._car) return; // the "no cars" message is already shown
    if (!customElements.get("mb-logbook-card")) {
      box.innerHTML = `<div class=empty>The logbook card didn't load. Refresh the page.</div>`;
      return;
    }
    const card = document.createElement("mb-logbook-card");
    card.setConfig({ entry_id: this._car.entry_id, period: "month", title: " " });
    card.hass = this._hass;
    box.innerHTML = "";
    box.appendChild(card);
    this._card = card;
  }

  // ----- overview --------------------------------------------------------------------

  async _loadOverview() {
    this._card = null;
    const box = this.shadowRoot.getElementById("content");
    const sk = (n, cls) => Array.from({ length: n }, () => `<div class="sk ${cls}"></div>`).join("");
    box.innerHTML = `<div class=section aria-busy="true"><div class="sk sk-h"></div><div class=tiles>${sk(7, "sk-tile")}</div></div>
      <div class=section><div class="sk sk-h"></div><div class=tiles>${sk(5, "sk-tile")}</div><div class="sk sk-chart"></div></div>
      <div class=grid>${Array.from({ length: 4 }, () => `<div class=section><div class="sk sk-h"></div><div class="sk sk-chart"></div></div>`).join("")}</div>`;
    const car = this._car;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;
    let stats;
    let routes;
    try {
      [stats, routes] = await Promise.all([
        this._hass.callWS({ type: "mb_logbook/stats", entry_id: car.entry_id, months: 12 }),
        this._hass.callWS({ type: "mb_logbook/routes", entry_id: car.entry_id, start: monthStart }),
      ]);
    } catch (e) {
      box.innerHTML = `<div class=empty>Couldn't load the figures: ${escp(e.message || e.code || e)}</div>`;
      return;
    }
    if (this._car !== car || this._view !== "overview") return;
    const months = stats.months;
    const cur = months[months.length - 1];
    const prev = months[months.length - 2];

    // good: +1 when more is better, -1 when less is better, 0 when it is neither (trips, distance).
    const delta = (a, b, fmt, good = 0) => {
      if (b == null || !b) return "";
      const diff = a - b;
      const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
      const cls = !diff || !good ? "" : Math.sign(diff) === good ? " good" : " bad";
      const arrow = diff > 0 ? picon("upright") : diff < 0 ? picon("downright") : "";
      return `<div class="delta${cls}">${arrow}<span>${sign}${fmt(Math.abs(diff))}</span> vs ${this._monthName(prev.month)}</div>`;
    };
    const eff = (m) => this._eff(m.km_with_kwh, m.kwh_used);
    const drain = (m) => (m.idle_hours ? (m.idle_drop / m.idle_hours) * 24 : null);
    const tile = (i, k, v, d = "") => `<div class=tile><div class=k>${picon(i)}${k}</div><div class=v>${v}</div>${d}</div>`;
    const tiles = [
      tile("car", "Trips", cur.trips, delta(cur.trips, prev?.trips, (x) => x)),
      tile("distance", "Distance", `${this._d(cur.distance_km)} ${this._du}`, delta(cur.distance_km, prev?.distance_km, (x) => `${this._d(x)} ${this._du}`)),
      tile("bolt", "Energy used", `${cur.kwh_used.toFixed(0)} kWh`, delta(cur.kwh_used, prev?.kwh_used, (x) => `${x.toFixed(0)} kWh`)),
      // mi/kWh: higher is better; kWh/100km: lower is better.
      tile("eff", "Efficiency", eff(cur) ? `${eff(cur).toFixed(2)} ${this._effUnit}` : "–", prev && eff(prev) && eff(cur) ? delta(eff(cur), eff(prev), (x) => x.toFixed(2), this._miles ? 1 : -1) : ""),
      tile("station", "Charged", `${cur.charged_kwh.toFixed(0)} kWh`, delta(cur.charged_kwh, prev?.charged_kwh, (x) => `${x.toFixed(0)} kWh`)),
      tile("cash", "Charging cost", this._money(cur.cost), delta(cur.cost, prev?.cost, (x) => this._money(x))),
      tile("drain", "Idle drain", drain(cur) != null ? `${drain(cur).toFixed(2)} %/day` : "–"),
    ].join("");

    const labels = months.map((m) => this._monthName(m.month).slice(0, 3));
    const charts = [
      this._chart(`Distance (${this._du})`, labels, [{ values: months.map((m) => +this._d(m.distance_km)), colour: 1 }], (v) => v.toFixed(0)),
      this._chart(
        "Energy (kWh): used driving vs charged",
        labels,
        [
          { name: "Used", values: months.map((m) => m.kwh_used), colour: 2 },
          { name: "Charged", values: months.map((m) => m.charged_kwh), colour: 3 },
        ],
        (v) => v.toFixed(0)
      ),
      this._chart("Charging cost", labels, [{ values: months.map((m) => m.cost), colour: 1 }], (v) => this._money(v, true)),
      this._chart(`Efficiency (${this._effUnit})`, labels, [{ values: months.map((m) => eff(m) || 0), colour: 1 }], (v) => (v ? v.toFixed(2) : "")),
      this._healthChart(months, labels),
      `<div class="section chart" id=tempeff><h2>Efficiency vs outside temperature</h2><div class=dim>Loading…</div></div>`,
    ].join("");

    const top = stats.top_places.length
      ? `<table class=places>${stats.top_places
          .map((p) => `<tr><td>${escp(p.name)}</td><td class=n>${p.count}</td><td class=bar><div style="width:${(p.count / stats.top_places[0].count) * 100}%"></div></td></tr>`)
          .join("")}</table>`
      : `<div class=dim>No named destinations yet.</div>`;

    box.innerHTML = `
      <div class=section><h2>${this._monthName(cur.month, true)} so far</h2><div class=tiles>${tiles}</div></div>
      <div class=section id=mileage></div>
      <div class=grid>${charts}</div>
      <div class=grid2>
        <div class=section><h2>Routes this month <span class=dim>(${routes.length} trips)</span></h2><div id=mapbox></div></div>
        <div class=section><h2>Most visited <span class=dim>(last 12 months)</span></h2>${top}</div>
      </div>
      <div class=section id=heat></div>`;
    this._loadMileage();
    this._loadHeat();
    this._loadTempEff();
    this._drawRoutes(routes);
  }

  /** Calendar period `offset` periods back: {start, end (seconds), label}. Same as the card. */
  _range(period, offset) {
    const loc = this._hass?.locale?.language;
    const now = new Date();
    let start;
    let end;
    let label;
    if (period === "week") {
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * offset);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const last = new Date(end.getTime() - 86400000);
      const f = (d, o) => d.toLocaleDateString(loc, o);
      label =
        start.getMonth() === last.getMonth()
          ? `${start.getDate()}–${f(last, { day: "numeric", month: "short", year: "numeric" })}`
          : `${f(start, { day: "numeric", month: "short" })} – ${f(last, { day: "numeric", month: "short", year: "numeric" })}`;
    } else if (period === "month") {
      start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      label = start.toLocaleDateString(loc, { month: "long", year: "numeric" });
    } else if (period === "quarter") {
      start = new Date(now.getFullYear(), now.getMonth() - 2 - 3 * offset, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
      const last = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      label = `${start.toLocaleDateString(loc, { month: "short" })} – ${last.toLocaleDateString(loc, { month: "short", year: "numeric" })}`;
    } else {
      start = new Date(now.getFullYear() - offset, 0, 1);
      end = new Date(start.getFullYear() + 1, 0, 1);
      label = String(start.getFullYear());
    }
    return { start: start.getTime() / 1000, end: end.getTime() / 1000, label };
  }

  /** Mileage by trip label for a chosen period (Business first), for mileage claims. */
  async _loadMileage() {
    const box = this.shadowRoot.getElementById("mileage");
    if (!box) return;
    const car = this._car;
    const { start, end, label } = this._range(this._mPeriod, this._mOffset);
    const periods = [["week", "Week"], ["month", "Month"], ["quarter", "3 months"], ["year", "Year"]];
    const head = `<div class=mhead><h2>Mileage by label</h2>
        <div class=seg>${periods.map(([v, l]) => `<button data-mp="${v}" class="${v === this._mPeriod ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class=stepper><button class=step data-ms="1" title="Previous" aria-label="Previous">${picon("left")}</button><span class=range>${escp(label)}</span><button class=step data-ms="-1" title="Next" aria-label="Next" ${this._mOffset === 0 ? "disabled" : ""}>${picon("right")}</button></div></div>`;
    box.innerHTML = `${head}<div class=dim>Loading…</div>`;
    this._wireMileage(box);
    // One fetch covers the chart's periods, ending with the chosen one.
    const n = { week: 12, month: 12, quarter: 8, year: 5 }[this._mPeriod];
    const spans = Array.from({ length: n }, (_, i) => this._range(this._mPeriod, this._mOffset + n - 1 - i));
    let all;
    try {
      all = await this._hass.callWS({ type: "mb_logbook/trips", entry_id: car.entry_id, start: spans[0].start, end });
    } catch (e) {
      box.innerHTML = `${head}<div class=dim>Couldn't load trips.</div>`;
      this._wireMileage(box);
      return;
    }
    if (this._car !== car) return;
    const trips = all.filter((t) => t.start_ts >= start);
    const loc = this._hass?.locale?.language;
    const barLabel = (s) => {
      const d = new Date(s.start * 1000);
      if (this._mPeriod === "week") return d.toLocaleDateString(loc, { day: "numeric", month: "short" });
      if (this._mPeriod === "month") return d.toLocaleDateString(loc, { month: "short" });
      if (this._mPeriod === "quarter") return d.toLocaleDateString(loc, { month: "short", year: "2-digit" });
      return String(d.getFullYear());
    };
    const biz = spans.map((s) => all.filter((t) => t.label === "Business" && t.start_ts >= s.start && t.start_ts < s.end).reduce((a, t) => a + t.distance_km, 0));
    const chart = this._chart(
      `Business mileage (${this._du})`,
      spans.map(barLabel),
      [{ values: biz.map((k) => +this._d(k, 1)), colour: LABEL_SLOTS.Business }],
      (v) => v.toFixed(1)
    );
    const groups = new Map();
    for (const t of trips) {
      const k = t.label || "";
      const g = groups.get(k) || { trips: 0, km: 0, auto: 0 };
      g.trips += 1;
      g.km += t.distance_km;
      if (t.label_auto) g.auto += 1;
      groups.set(k, g);
    }
    const order = [...groups.keys()].sort((a, b) => (a === "Business" ? -1 : b === "Business" ? 1 : !a ? 1 : !b ? -1 : a.localeCompare(b)));
    if (!groups.has("Business")) order.unshift("Business");
    const totalKm = trips.reduce((s, t) => s + t.distance_km, 0);
    const tiles = order
      .map((k) => {
        const g = groups.get(k) || { trips: 0, km: 0, auto: 0 };
        const name = k || "Unlabelled";
        return `<div class="tile ${k === "Business" ? "biz" : ""}"><div class=k><i class=dot style="background:var(--mbl-c${LABEL_SLOTS[k] || 0})"></i>${escp(name)}</div><div class=v>${this._d(g.km, 1)} ${this._du}</div>
          <div class=delta>${g.trips} trip${g.trips === 1 ? "" : "s"}${g.auto ? ` · ${g.auto} from place defaults` : ""}</div></div>`;
      })
      .join("");
    box.innerHTML = `${head}<div class=tiles>${tiles}<div class=tile><div class=k>All trips</div><div class=v>${this._d(totalKm, 1)} ${this._du}</div><div class=delta>${trips.length} trips</div></div></div>
      <div class=mchart>${chart}</div>
      <div class=dim style="margin-top:8px">Label trips (or give places a default label) in the Logbook tab; export them as CSV from there.</div>`;
    this._wireMileage(box);
  }

  _wireMileage(box) {
    box.querySelectorAll("button[data-mp]").forEach((b) =>
      b.addEventListener("click", () => {
        this._mPeriod = b.dataset.mp;
        this._mOffset = 0;
        this._loadMileage();
      })
    );
    box.querySelectorAll("button[data-ms]").forEach((b) =>
      b.addEventListener("click", () => {
        this._mOffset = Math.max(0, this._mOffset + Number(b.dataset.ms));
        this._loadMileage();
      })
    );
  }

  /** Range the car predicts at 100% battery, month by month: a slow fall is battery wear. */
  _healthChart(months, labels) {
    const vals = months.map((m) => (m.range100_km ? +this._d(m.range100_km) : 0));
    const have = vals.filter(Boolean);
    const title = `Battery health: predicted range at 100% (${this._du})`;
    if (!have.length) return `<div class="section chart"><h2>${title}</h2><div class=dim>No readings yet: this uses the car's range at 70% battery or more.</div></div>`;
    // Start the bars near the lowest month so a few percent of wear is visible.
    const base = Math.floor((Math.min(...have) * 0.9) / 10) * 10;
    const first = have[0];
    const last = have[have.length - 1];
    const note = have.length > 1 ? `${last >= first ? "+" : "−"}${Math.abs(((last - first) / first) * 100).toFixed(1)}% since ${labels[vals.indexOf(first)]}. The car's range also moves with driving style and temperature, so look at the trend over months. The bars start at ${base} ${this._du}, not zero, so a small change shows.` : "";
    return this._chart(title, labels, [{ values: vals, colour: 1 }], (v) => (v ? v.toFixed(0) : ""), { base, note });
  }

  async _loadTempEff() {
    const box = this.shadowRoot.getElementById("tempeff");
    if (!box) return;
    const car = this._car;
    let res;
    try {
      res = await this._hass.callWS({ type: "mb_logbook/temp_efficiency", entry_id: car.entry_id, months: 12 });
    } catch (e) {
      box.querySelector(".dim").textContent = "Couldn't load.";
      return;
    }
    if (this._car !== car) return;
    if (!res.source) {
      box.querySelector(".dim").textContent = "No weather entity found. Add a weather integration, or choose a temperature sensor in the car's options (Settings → Devices & services → Mercedes EV Logbook → Configure).";
      return;
    }
    const bands = res.bands.filter((b) => b.trips);
    if (!bands.length) {
      box.querySelector(".dim").textContent = `No trips with a temperature from ${res.name} yet. Each new trip records it; older trips only as far back as Home Assistant keeps history.`;
      return;
    }
    const lbl = (b) => (b.lo < -50 ? `below ${b.hi}°C` : b.hi > 50 ? `${b.lo}°C +` : `${b.lo}–${b.hi}°C`);
    const html = this._chart(
      `Efficiency vs outside temperature (${this._effUnit})`,
      bands.map((b) => `${lbl(b)}\n${b.trips} trip${b.trips === 1 ? "" : "s"}`),
      [{ values: bands.map((b) => this._eff(b.km, b.kwh) || 0), colour: 1 }],
      (v) => (v ? v.toFixed(2) : ""),
      { allValues: true, note: `Temperature when each trip started, from ${escp(res.name)}. Trips under 5 km are left out.` }
    );
    box.outerHTML = html.replace('<div class="section chart">', '<div class="section chart" id=tempeff>');
  }

  /** Grouped bar chart in plain HTML. series: [{name?, values[], colour}] where colour is a
   * palette slot (1-8). opts.base: value at the bottom of the bars (0 normally).
   * Every bar carries its figure, the latest in bold (opts.allValues: all in bold); hover, tap
   * or keyboard focus shows the full figures. opts.note: a line under the chart. */
  _chart(title, labels, series, fmt, { base = 0, allValues = false, note = "" } = {}) {
    const n = labels.length;
    const all = series.flatMap((s) => s.values);
    const max = Math.max(base + 1e-9, ...all);
    // Round the top of the scale up to a tidy step, for two to four gridlines.
    const raw = (max - base) / 3;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) || raw;
    const top = base + Math.ceil((max - base) / step - 1e-9) * step;
    const pct = (v) => (v ? (Math.max(v - base, 0) / (top - base)) * 100 : 0);
    // Axis figures drop a pointless ".0" ("600", not "600.0").
    const tick = (v) => (fmt(v) || String(+v.toFixed(2))).replace(/\.0+(?=\D*$)/, "");
    let grid = "";
    for (let v = base; v <= top + step / 2; v += step) grid += `<div class=gl style="bottom:${pct(v) || 0}%"><span>${v === 0 ? "0" : tick(v)}</span></div>`;
    const single = series.length === 1;
    // The figure on a bar. On a narrow screen a long one loses its decimals ("420.6"
    // becomes "421") so twelve fit side by side; the css picks which of the two shows.
    const short = (v) => {
      const t = fmt(v);
      return t.length > 4 && /\.\d+$/.test(t) ? `<span class=wide>${t}</span><span class=narrow>${Math.round(v)}</span>` : t;
    };
    const cols = labels
      .map((l, i) => {
        const name = String(l).split("\n")[0];
        const cls = `val${i === n - 1 || allValues ? " now" : ""}`;
        // One series: the figure sits on its bar. Two: both figures sit above the pair, in legend order.
        const bars = series
          .map((s) => {
            const v = s.values[i];
            return `<div class=bar style="height:${pct(v).toFixed(2)}%;background:var(--mbl-c${s.colour})">${single && v ? `<span class="${cls}">${short(v)}</span>` : ""}</div>`;
          })
          .join("");
        const vs = series.map((s) => s.values[i]);
        const pair = !single && vs.some(Boolean) ? `<span class="${cls} pair" style="bottom:${pct(Math.max(...vs)).toFixed(2)}%">${vs.map((v) => (v ? short(v) : "–")).join("<br>")}</span>` : "";
        const tip = series.map((s) => `<div>${single ? "" : `<i style="background:var(--mbl-c${s.colour})"></i>${s.name} `}<b>${fmt(s.values[i]) || "–"}</b></div>`).join("");
        return `<div class=col tabindex=0><div class=bars>${bars}${pair}</div><div class=tip><span>${name}</span>${tip}</div></div>`;
      })
      .join("");
    // A label may have a second line ("5–10°\n9 trips").
    const xl = labels
      .map((l) => {
        const [a, b] = String(l).split("\n");
        return `<span>${a}${b ? `<small>${b}</small>` : ""}</span>`;
      })
      .join("");
    const legend = single ? "" : `<div class=legend>${series.map((s) => `<span><i style="background:var(--mbl-c${s.colour})"></i>${s.name}</span>`).join("")}</div>`;
    return `<div class="section chart"><h2>${title}</h2>${legend}<div class="plot${single ? "" : " multi"}"><div class=grid>${grid}</div><div class=cols>${cols}</div></div><div class=xl>${xl}</div>${note ? `<div class="dim note">${note}</div>` : ""}</div>`;
  }

  /** "Where you go": a heat map of every trip's end point for a chosen period. */
  async _loadHeat() {
    const box = this.shadowRoot.getElementById("heat");
    if (!box) return;
    const car = this._car;
    const periods = [["month", "Month"], ["quarter", "3 months"], ["year", "Year"], ["all", "All time"]];
    const now = new Date();
    const start = {
      month: new Date(now.getFullYear(), now.getMonth(), 1),
      quarter: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      year: new Date(now.getFullYear() - 1, now.getMonth() + 1, 1),
      all: new Date(2000, 0, 1),
    }[this._hPeriod] / 1000;
    const head = (n) => `<div class=mhead><h2>Where you go ${n != null ? `<span class=dim>(${n} stops)</span>` : ""}</h2>
        <div class=seg>${periods.map(([v, l]) => `<button data-hp="${v}" class="${v === this._hPeriod ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
    box.innerHTML = `${head()}<div id=heatbox><div class=empty>Loading…</div></div>`;
    this._wireHeat(box);
    let trips;
    try {
      trips = await this._hass.callWS({ type: "mb_logbook/trips", entry_id: car.entry_id, start, end: Date.now() / 1000 + 86400 });
    } catch (e) {
      box.querySelector("#heatbox").innerHTML = `<div class=empty>Couldn't load trips.</div>`;
      return;
    }
    if (this._car !== car) return;
    const pts = trips.filter((t) => t.end_lat != null && t.end_lon != null).map((t) => [t.end_lat, t.end_lon]);
    box.querySelector("h2").outerHTML = head(pts.length).match(/<h2>.*<\/h2>/s)[0];
    const hb = box.querySelector("#heatbox");
    if (!pts.length) {
      hb.innerHTML = `<div class=empty>No trips in this period.</div>`;
      return;
    }
    const map = await this._newMap(hb);
    if (!map) return;
    const ml = map._engine?._map; // MapLibre map inside HA's <ha-map> (not a public API)
    if (!ml || typeof ml.addLayer !== "function") {
      hb.innerHTML = `<div class=empty>The heat map needs Home Assistant's newer map (MapLibre), which this browser or version isn't using.</div>`;
      return;
    }
    // Group stops into ~100 m squares weighted by log(visits), so a place visited 90
    // times is hot without drowning out one visited 10 times or once.
    const cells = new Map();
    for (const [lat, lon] of pts) {
      const k = `${Math.round(lat * 1000)},${Math.round(lon * 700)}`;
      const c = cells.get(k) || { n: 0, lat: 0, lon: 0 };
      c.n += 1;
      c.lat += lat;
      c.lon += lon;
      cells.set(k, c);
    }
    const data = {
      type: "FeatureCollection",
      features: [...cells.values()].map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lon / c.n, c.lat / c.n] },
        properties: { w: 1 + Math.log(c.n) },
      })),
    };
    const add = () => {
      if (ml.getSource("mb-heat")) return;
      ml.addSource("mb-heat", { type: "geojson", data });
      ml.addLayer({
        id: "mb-heat",
        type: "heatmap",
        source: "mb-heat",
        paint: {
          "heatmap-weight": ["get", "w"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 0.15, 15, 0.3],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 8, 10, 20, 15, 44],
          "heatmap-opacity": 0.8,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.08, "rgba(137,180,250,0.35)",
            0.25, "rgba(116,199,236,0.7)",
            0.45, "rgb(166,227,161)",
            0.65, "rgb(249,226,175)",
            0.82, "rgb(250,179,135)",
            1, "rgb(243,139,168)",
          ],
        },
      });
    };
    add();
    // HA redraws the map style when the theme changes; put the layer back.
    ml.on("styledata", () => {
      try {
        add();
      } catch (e) {
        /* style still loading */
      }
    });
    // Fit to the middle 95% of stops so one long trip doesn't zoom the map right out.
    const sorted = (i) => pts.map((p) => p[i]).sort((a, b) => a - b);
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * (arr.length - 1))))];
    const la = sorted(0);
    const lo = sorted(1);
    map.fitBounds(
      [
        [q(la, 0.025), q(lo, 0.025)],
        [q(la, 0.975), q(lo, 0.975)],
      ],
      { zoom: 15, pad: 0.15 }
    );
  }

  _wireHeat(box) {
    box.querySelectorAll("button[data-hp]").forEach((b) =>
      b.addEventListener("click", () => {
        this._hPeriod = b.dataset.hp;
        this._loadHeat();
      })
    );
  }

  /** A loaded <ha-map> in `box`, or null (with a message) if HA's map isn't available. */
  async _newMap(box) {
    if (!customElements.get("ha-map")) {
      try {
        const helpers = await window.loadCardHelpers();
        helpers.createCardElement({ type: "map", entities: ["zone.home"] });
        await Promise.race([customElements.whenDefined("ha-map"), new Promise((r) => setTimeout(r, 5000))]);
      } catch (e) {
        /* fall through */
      }
    }
    if (!customElements.get("ha-map")) {
      box.innerHTML = `<div class=empty>Map unavailable.</div>`;
      return null;
    }
    const map = document.createElement("ha-map");
    map.hass = this._hass;
    map.autoFit = false;
    map.fitZones = false;
    box.innerHTML = "";
    box.appendChild(map);
    for (let i = 0; i < 60 && !map._loaded; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 150));
    return map;
  }

  async _drawRoutes(routes) {
    const box = this.shadowRoot.getElementById("mapbox");
    if (!box) return;
    const paths = routes
      .filter((r) => r.points.length >= 2)
      .map((r, i) => ({
        color: ROUTE_COLOURS[i % ROUTE_COLOURS.length],
        gradualOpacity: 0,
        fullDatetime: false,
        points: r.points
          .filter((p) => p[1] != null)
          .map((p) => ({ timestamp: new Date(p[0] * 1000), point: [p[1], p[2]], latitude: p[1], longitude: p[2] })),
      }));
    if (!paths.length) {
      box.innerHTML = `<div class=empty>No routes yet this month.</div>`;
      return;
    }
    if (!customElements.get("ha-map")) {
      try {
        const helpers = await window.loadCardHelpers();
        helpers.createCardElement({ type: "map", entities: ["zone.home"] });
        await Promise.race([customElements.whenDefined("ha-map"), new Promise((r) => setTimeout(r, 5000))]);
      } catch (e) {
        /* fall through */
      }
    }
    if (!customElements.get("ha-map")) {
      box.innerHTML = `<div class=empty>Map unavailable.</div>`;
      return;
    }
    const map = document.createElement("ha-map");
    map.hass = this._hass;
    map.autoFit = false;
    map.fitZones = false;
    map.paths = paths;
    box.innerHTML = "";
    box.appendChild(map);
    this._map = map;
    for (let i = 0; i < 60 && !map._loaded; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 150));
    const pts = paths.flatMap((p) => p.points.map((q) => q.point));
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ],
      { zoom: 16, pad: 0.1 }
    );
  }
}

MBLogbookPanel.css = `
  /* Sizes and colours match the logbook card. Surfaces and text come from the Home
   * Assistant theme; the eight chart and label colours have a light and a dark step. */
  :host { display: block; height: 100%; background: var(--primary-background-color); color: var(--primary-text-color); overflow-y: auto;
    --mbl-r: 8px; --mbl-r-box: 10px; --mbl-h: 32px; --mbl-line: var(--divider-color);
    --mbl-c0: var(--secondary-text-color); --mbl-c1: #2a78d6; --mbl-c2: #eb6834; --mbl-c3: #1baf7a; --mbl-c4: #eda100;
    --mbl-c5: #e87ba4; --mbl-c6: #008300; --mbl-c7: #6250d6; --mbl-c8: #e34948; }
  :host([dark]) { --mbl-c1: #3987e5; --mbl-c2: #d95926; --mbl-c3: #199e70; --mbl-c4: #c98500; --mbl-c5: #d55181; --mbl-c7: #9085e9; --mbl-c8: #e66767; }
  .ic { width: 16px; height: 16px; fill: currentColor; flex: none; }
  button { font: inherit; cursor: pointer; }
  :is(button, .col):focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .toolbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 16px; min-height: 56px; box-sizing: border-box;
    background: var(--app-header-background-color, var(--primary-background-color)); color: var(--app-header-text-color, var(--primary-text-color)); border-bottom: 1px solid var(--mbl-line); }
  .apptitle { font-size: 20px; flex: 1; }
  .seg { display: inline-flex; border: 1px solid var(--mbl-line); border-radius: var(--mbl-r-box); overflow: hidden; }
  .seg button { background: none; border: 0; color: var(--secondary-text-color); padding: 0 14px; height: calc(var(--mbl-h) - 2px); white-space: nowrap; }
  .seg button:hover { color: var(--primary-text-color); }
  .seg button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .toolbar .seg { border-color: color-mix(in srgb, currentColor 35%, transparent); }
  .toolbar .seg button { color: inherit; opacity: .8; }
  .toolbar .seg button.on { opacity: 1; background: color-mix(in srgb, currentColor 22%, transparent); color: inherit; font-weight: 500; }
  .content { padding: 16px; max-width: 1400px; margin: 0 auto; }
  .empty { padding: 32px; text-align: center; color: var(--secondary-text-color); }
  .section { background: var(--card-background-color); border-radius: var(--ha-card-border-radius, 12px); padding: 16px; margin-bottom: 16px;
    border: 1px solid var(--ha-card-border-color, var(--mbl-line)); }
  h2 { font-size: 1.05em; font-weight: 600; margin: 0 0 12px; }
  .dim { color: var(--secondary-text-color); font-weight: normal; font-size: .9em; }
  .mhead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .mhead h2 { margin: 0; flex: 1; }
  .mchart { margin-top: 16px; }
  .mchart .section { padding: 0; margin: 0; background: none; border: 0; }
  .mchart h2 { font-size: .95em; }
  .stepper { display: inline-flex; align-items: center; gap: 4px; }
  .stepper .range { min-width: 9em; text-align: center; font-weight: 500; }
  button.step { display: inline-grid; place-items: center; width: var(--mbl-h); height: var(--mbl-h); padding: 0; border-radius: 50%; border: 1px solid var(--mbl-line); background: none; color: var(--primary-text-color); }
  button.step .ic { width: 18px; height: 18px; }
  button.step:hover:not(:disabled) { background: var(--secondary-background-color); }
  button.step:disabled { opacity: .35; cursor: default; }

  /* Figures */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .tile { background: var(--secondary-background-color); border-radius: var(--mbl-r-box); padding: 10px 12px; min-width: 0; }
  .tile.biz { box-shadow: inset 0 0 0 2px var(--mbl-c1); }
  .k { display: flex; align-items: center; gap: 6px; font-size: .8em; color: var(--secondary-text-color); white-space: nowrap; }
  .k .ic { color: var(--primary-color); }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .v { font-size: 1.35em; font-weight: 600; margin-top: 3px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .delta { display: flex; align-items: center; gap: 3px; font-size: .78em; color: var(--secondary-text-color); margin-top: 2px; font-variant-numeric: tabular-nums; flex-wrap: wrap; }
  .delta .ic { width: 13px; height: 13px; }
  .delta span { margin-right: 2px; }
  .delta.good .ic, .delta.good span { color: var(--success-color, #43a047); }
  .delta.bad .ic, .delta.bad span { color: var(--warning-color, #ffa600); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 0 16px; }
  .grid2 { display: grid; grid-template-columns: 2fr 1fr; gap: 0 16px; }
  @media (max-width: 900px) { .grid, .grid2 { grid-template-columns: 1fr; } }

  /* Charts: gridlines behind, one column per period, a pop-up with the figures on hover */
  .chart .plot { --pt: 18px; position: relative; height: 170px; margin-left: 38px; padding-top: var(--pt); box-sizing: border-box; }
  .chart .plot.multi { --pt: 30px; height: 182px; }
  .chart .grid { position: absolute; inset: var(--pt) 0 0 0; display: block; pointer-events: none; }
  .chart .gl { position: absolute; left: 0; right: 0; border-top: 1px solid color-mix(in srgb, var(--mbl-line) 60%, transparent); }
  .chart .gl:first-child { border-top-color: var(--mbl-line); }
  .chart .gl span { position: absolute; right: 100%; top: 0; transform: translateY(-50%); margin-right: 8px; font-size: 11px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chart .cols { position: relative; display: flex; height: 100%; }
  .chart .col { position: relative; flex: 1; min-width: 0; display: flex; justify-content: center; border-radius: 4px 4px 0 0; outline-offset: -2px; }
  .chart .col:hover, .chart .col:focus { background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .chart .bars { position: relative; display: flex; align-items: flex-end; justify-content: center; gap: 2px; width: 72%; max-width: 96px; height: 100%; }
  .chart .bar { position: relative; flex: 1; min-width: 2px; max-width: 44px; border-radius: 4px 4px 0 0; }
  .chart .val { position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%); margin-bottom: 3px; font-size: 11px; font-weight: 500; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chart .narrow { display: none; }
  .chart .val.pair { line-height: 1.15; text-align: center; }
  .chart .val.now { font-size: 12px; font-weight: 600; color: var(--primary-text-color); }
  .chart .tip { display: none; position: absolute; z-index: 2; top: -10px; left: 50%; transform: translateX(-50%); padding: 6px 10px; border-radius: var(--mbl-r);
    background: var(--card-background-color); border: 1px solid var(--mbl-line); box-shadow: 0 4px 14px rgba(0, 0, 0, .25); font-size: 12px; line-height: 1.5; white-space: nowrap; pointer-events: none; font-variant-numeric: tabular-nums; }
  .chart .col:hover .tip, .chart .col:focus .tip { display: block; }
  .chart .col:first-child .tip { left: 0; transform: none; }
  .chart .col:last-child .tip { left: auto; right: 0; transform: none; }
  .chart .tip span { display: block; color: var(--secondary-text-color); }
  .chart .tip i, .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }
  .chart .xl { display: flex; margin: 6px 0 0 38px; }
  .chart .xl span { flex: 1; min-width: 0; text-align: center; font-size: 12px; color: var(--secondary-text-color); line-height: 1.3; overflow: hidden; }
  .chart .xl small { display: block; font-size: 11px; opacity: .85; }
  .chart .note { margin-top: 10px; }
  @media (max-width: 600px) { .chart .wide { display: none; } .chart .narrow { display: inline; } .chart .xl span, .chart .val, .chart .val.now { font-size: 10px; } .chart .plot, .chart .xl { margin-left: 32px; } }
  .legend { display: flex; gap: 14px; font-size: .8em; color: var(--secondary-text-color); margin: -6px 0 8px; }
  #mapbox { height: 380px; border-radius: var(--mbl-r-box); overflow: hidden; }
  #heatbox { height: 460px; border-radius: var(--mbl-r-box); overflow: hidden; }
  #heatbox ha-map { display: block; height: 100%; }
  #mapbox ha-map { display: block; height: 100%; }
  table.places { width: 100%; border-collapse: collapse; }
  table.places td { padding: 7px 4px; border-bottom: 1px solid var(--mbl-line); }
  table.places .n { text-align: right; width: 3em; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
  table.places .bar { width: 35%; }
  table.places .bar div { height: 8px; border-radius: 4px; background: var(--mbl-c1); }
  mb-logbook-card { display: block; }

  /* Loading placeholders */
  .sk { border-radius: var(--mbl-r); background: linear-gradient(90deg, var(--secondary-background-color) 25%, color-mix(in srgb, var(--secondary-background-color) 55%, transparent) 40%, var(--secondary-background-color) 60%) 0 0 / 300% 100%; animation: mbl-sk 1.4s ease-in-out infinite; }
  .sk-h { width: 160px; height: 20px; margin-bottom: 14px; }
  .sk-tile { height: 74px; border-radius: var(--mbl-r-box); }
  .sk-chart { height: 190px; margin-top: 12px; }
  @keyframes mbl-sk { from { background-position: 100% 0; } to { background-position: 0 0; } }
  @media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
`;

if (!customElements.get("mb-logbook-panel")) customElements.define("mb-logbook-panel", MBLogbookPanel);
