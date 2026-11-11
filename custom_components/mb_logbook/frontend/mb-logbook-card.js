/* Mercedes EV Logbook card: trips (with route map), parked drain and charging sessions.
 * Data comes from the mb_logbook WebSocket API; the map is Home Assistant's own
 * <ha-map>, so it uses the same map tiles as HA's map card and nothing else. */

const KM_PER_MI = 1.609344;
// Where a charging session's kWh came from (best first).
const SRC = { meter: "metered", power: "from charging power", battery: "from battery %" };
// Trip distance filter bands, in the car's unit: [value, label, from, below]
const DIST_BANDS = [["s", "Under 5", 0, 5], ["m", "5 – 25", 5, 25], ["l", "25 – 100", 25, 100], ["xl", "100+", 100, Infinity]];
// Calendar periods; the arrows step back and forward by one period.
const PERIODS = [
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "3 months"],
  ["year", "Year"],
];
// Older configs used `days:`.
const DAYS_TO_PERIOD = { 7: "week", 30: "month", 90: "quarter", 365: "year" };

// Icons are Material Design Icons paths (the set Home Assistant uses), drawn inline so they
// look the same on every device and need nothing from Home Assistant's own icon loader.
const ICONS = {
  route: "M18,15A3,3 0 0,1 21,18A3,3 0 0,1 18,21C16.69,21 15.58,20.17 15.17,19H14V17H15.17C15.58,15.83 16.69,15 18,15M18,17A1,1 0 0,0 17,18A1,1 0 0,0 18,19A1,1 0 0,0 19,18A1,1 0 0,0 18,17M18,8A1.43,1.43 0 0,0 19.43,6.57C19.43,5.78 18.79,5.14 18,5.14C17.21,5.14 16.57,5.78 16.57,6.57A1.43,1.43 0 0,0 18,8M18,2.57A4,4 0 0,1 22,6.57C22,9.56 18,14 18,14C18,14 14,9.56 14,6.57A4,4 0 0,1 18,2.57M8.83,17H10V19H8.83C8.42,20.17 7.31,21 6,21A3,3 0 0,1 3,18C3,16.69 3.83,15.58 5,15.17V14H7V15.17C7.85,15.47 8.53,16.15 8.83,17M6,17A1,1 0 0,0 5,18A1,1 0 0,0 6,19A1,1 0 0,0 7,18A1,1 0 0,0 6,17M6,3A3,3 0 0,1 9,6C9,7.31 8.17,8.42 7,8.83V10H5V8.83C3.83,8.42 3,7.31 3,6A3,3 0 0,1 6,3M6,5A1,1 0 0,0 5,6A1,1 0 0,0 6,7A1,1 0 0,0 7,6A1,1 0 0,0 6,5M11,19V17H13V19H11M7,13H5V11H7V13Z",
  bolt: "M11 15H6L13 1V9H18L11 23V15Z",
  left: "M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z",
  right: "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z",
  up: "M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z",
  down: "M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z",
  download: "M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z",
  clear: "M14.73,20.83L17.58,18L14.73,15.17L16.15,13.76L19,16.57L21.8,13.76L23.22,15.17L20.41,18L23.22,20.83L21.8,22.24L19,19.4L16.15,22.24L14.73,20.83M13,19.88C13.04,20.18 12.94,20.5 12.71,20.71C12.32,21.1 11.69,21.1 11.3,20.71L7.29,16.7C7.06,16.47 6.96,16.16 7,15.87V10.75L2.21,4.62C1.87,4.19 1.95,3.56 2.38,3.22C2.57,3.08 2.78,3 3,3V3H17V3C17.22,3 17.43,3.08 17.62,3.22C18.05,3.56 18.13,4.19 17.79,4.62L13,10.75V19.88M5.04,5L9,10.06V15.58L11,17.58V10.05L14.96,5H5.04Z",
  car: "M5,11L6.5,6.5H17.5L19,11M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M18.92,6C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.28,5.42 5.08,6L3,12V20A1,1 0 0,0 4,21H5A1,1 0 0,0 6,20V19H18V20A1,1 0 0,0 19,21H20A1,1 0 0,0 21,20V12L18.92,6Z",
  distance: "M6.5,8.11C5.61,8.11 4.89,7.39 4.89,6.5A1.61,1.61 0 0,1 6.5,4.89C7.39,4.89 8.11,5.61 8.11,6.5V6.5A1.61,1.61 0 0,1 6.5,8.11M6.5,2C4,2 2,4 2,6.5C2,9.87 6.5,14.86 6.5,14.86C6.5,14.86 11,9.87 11,6.5C11,4 9,2 6.5,2M17.5,8.11A1.61,1.61 0 0,1 15.89,6.5C15.89,5.61 16.61,4.89 17.5,4.89C18.39,4.89 19.11,5.61 19.11,6.5A1.61,1.61 0 0,1 17.5,8.11M17.5,2C15,2 13,4 13,6.5C13,9.87 17.5,14.86 17.5,14.86C17.5,14.86 22,9.87 22,6.5C22,4 20,2 17.5,2M17.5,16C16.23,16 15.1,16.8 14.68,18H9.32C8.77,16.44 7.05,15.62 5.5,16.17C3.93,16.72 3.11,18.44 3.66,20C4.22,21.56 5.93,22.38 7.5,21.83C8.35,21.53 9,20.85 9.32,20H14.69C15.24,21.56 16.96,22.38 18.5,21.83C20.08,21.28 20.9,19.56 20.35,18C19.92,16.8 18.78,16 17.5,16V16M17.5,20.5A1.5,1.5 0 0,1 16,19A1.5,1.5 0 0,1 17.5,17.5A1.5,1.5 0 0,1 19,19A1.5,1.5 0 0,1 17.5,20.5Z",
  eff: "M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z",
  drain: "M18 9.29V5.33C18 4.6 17.4 4 16.67 4H15V2H9V4H7.33C6.6 4 6 4.6 6 5.33V20.67C6 21.4 6.6 22 7.33 22H12.41C13.46 22.63 14.69 23 16 23C19.87 23 23 19.87 23 16C23 12.83 20.89 10.15 18 9.29M8 6H16V9C12.13 9 9 12.13 9 16C9 17.5 9.47 18.87 10.26 20H8V6M16 21C13.24 21 11 18.76 11 16S13.24 11 16 11 21 13.24 21 16 18.76 21 16 21M16.5 16.25L19.36 17.94L18.61 19.16L15 17V12H16.5V16.25Z",
  station: "M19.77,7.23L19.78,7.22L16.06,3.5L15,4.56L17.11,6.67C16.17,7.03 15.5,7.93 15.5,9A2.5,2.5 0 0,0 18,11.5C18.36,11.5 18.69,11.42 19,11.29V18.5A1,1 0 0,1 18,19.5A1,1 0 0,1 17,18.5V14A2,2 0 0,0 15,12H14V5A2,2 0 0,0 12,3H6A2,2 0 0,0 4,5V21H14V13.5H15.5V18.5A2.5,2.5 0 0,0 18,21A2.5,2.5 0 0,0 20.5,18.5V9C20.5,8.31 20.22,7.68 19.77,7.23M18,10A1,1 0 0,1 17,9A1,1 0 0,1 18,8A1,1 0 0,1 19,9A1,1 0 0,1 18,10M8,18V13.5H6L10,6V11H12L8,18Z",
  home: "M12 5.69L17 10.19V18H15V12H9V18H7V10.19L12 5.69M12 3L2 12H5V20H11V14H13V20H19V12H22",
  cash: "M5,6H23V18H5V6M14,9A3,3 0 0,1 17,12A3,3 0 0,1 14,15A3,3 0 0,1 11,12A3,3 0 0,1 14,9M9,8A2,2 0 0,1 7,10V14A2,2 0 0,1 9,16H19A2,2 0 0,1 21,14V10A2,2 0 0,1 19,8H9M1,10H3V20H19V22H1V10Z",
  filter: "M6,13H18V11H6M3,6V8H21V6M10,18H14V16H10V18Z",
  close: "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z",
  tag: "M21.41 11.58L12.41 2.58A2 2 0 0 0 11 2H4A2 2 0 0 0 2 4V11A2 2 0 0 0 2.59 12.42L11.59 21.42A2 2 0 0 0 13 22A2 2 0 0 0 14.41 21.41L21.41 14.41A2 2 0 0 0 22 13A2 2 0 0 0 21.41 11.58M13 20L4 11V4H11L20 13M6.5 5A1.5 1.5 0 1 1 5 6.5A1.5 1.5 0 0 1 6.5 5Z",
};
const icon = (name, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
// Label colours: a fixed slot per label (never by position in a list), so Business is the
// same colour on the trips, the tiles and the charts. Slot 0 is neutral.
const LABEL_SLOTS = { Business: 1, Commute: 2, Personal: 3 };

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

class MBLogbookCard extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._period =
      PERIODS.find(([p]) => p === this._config.period)?.[0] || DAYS_TO_PERIOD[this._config.days] || "month";
    this._offset = 0; // 0 = the current period, 1 = the one before, ...
    this._labelFilter = "all";
    this._cf = { trips: {}, charges: {} }; // column filters: tab -> { column: chosen value }
    this._sort = {}; // tab -> { key, dir }, unset = the default order
    this._tab = "trips";
    this._open = null;
    this._cars = null;
    this._car = null;
    this._trips = [];
    this._charges = [];
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (this._map) this._map.hass = hass;
    this.toggleAttribute("dark", !!hass.themes?.darkMode);
    if (first) {
      this._renderSkeleton();
      this._init();
    }
  }

  /** Grey placeholder shapes while the first load runs, so the card doesn't jump in. */
  _renderSkeleton() {
    const bars = (n, cls) => Array.from({ length: n }, () => `<div class="sk ${cls}"></div>`).join("");
    this.shadowRoot.innerHTML = `<style>${MBLogbookCard.css}</style>
      <ha-card aria-busy="true"><div class="sk sk-title"></div><div class=tiles>${bars(5, "sk-tile")}</div>${bars(8, "sk-row")}</ha-card>`;
  }

  /** Colour slot (1-8, 0 = neutral) for a trip label. */
  _slot(label) {
    if (!label) return 0;
    if (LABEL_SLOTS[label]) return LABEL_SLOTS[label];
    const others = (this._labels || []).filter((l) => !LABEL_SLOTS[l]);
    const i = others.indexOf(label);
    return i >= 0 && i < 5 ? i + 4 : 0;
  }

  /** A label as a coloured chip (dot plus text). */
  _chip(label, auto = false) {
    return `<span class="lchip${auto ? " auto" : ""}" style="--c:var(--mbl-c${this._slot(label)})"><i></i>${esc(label)}</span>`;
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  static getStubConfig() {
    return { period: "month" };
  }

  /** Start/end (seconds) and a label for the chosen period, `offset` periods back. */
  _range() {
    const loc = this._hass?.locale?.language;
    const now = new Date();
    const o = this._offset;
    let start;
    let end;
    let label;
    if (this._period === "week") {
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * o);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const last = new Date(end.getTime() - 86400000);
      const f = (d, opts) => d.toLocaleDateString(loc, opts);
      label =
        start.getMonth() === last.getMonth()
          ? `${start.getDate()}–${f(last, { day: "numeric", month: "short", year: "numeric" })}`
          : `${f(start, { day: "numeric", month: "short" })} – ${f(last, { day: "numeric", month: "short", year: "numeric" })}`;
    } else if (this._period === "month") {
      start = new Date(now.getFullYear(), now.getMonth() - o, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      label = start.toLocaleDateString(loc, { month: "long", year: "numeric" });
    } else if (this._period === "quarter") {
      start = new Date(now.getFullYear(), now.getMonth() - 2 - 3 * o, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
      const last = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      label = `${start.toLocaleDateString(loc, { month: "short" })} – ${last.toLocaleDateString(loc, { month: "short", year: "numeric" })}`;
    } else {
      start = new Date(now.getFullYear() - o, 0, 1);
      end = new Date(start.getFullYear() + 1, 0, 1);
      label = String(start.getFullYear());
    }
    return { start: start.getTime() / 1000, end: end.getTime() / 1000, label };
  }

  async _init() {
    try {
      this._cars = await this._hass.callWS({ type: "mb_logbook/cars" });
    } catch (e) {
      this._error = "Mercedes EV Logbook isn't loaded.";
      this._render();
      return;
    }
    const wanted = this._config.entry_id || (this._config.car || "").toLowerCase();
    this._car =
      this._cars.find((c) => c.entry_id === wanted || c.name.toLowerCase() === wanted) || this._cars[0] || null;
    await this._load();
  }

  async _load() {
    if (!this._car) {
      this._error = "No cars set up yet.";
      this._render();
      return;
    }
    const { start, end } = this._range();
    const args = { entry_id: this._car.entry_id, start, end };
    const [trips, charges, places, rates, labels, placeLabels, unnamed, ignored] = await Promise.all([
      this._hass.callWS({ type: "mb_logbook/trips", ...args }),
      this._hass.callWS({ type: "mb_logbook/charges", ...args }),
      this._hass.callWS({ type: "mb_logbook/places" }),
      this._hass.callWS({ type: "mb_logbook/rates" }).catch(() => ({ locations: [], rates: [] })),
      this._hass.callWS({ type: "mb_logbook/labels" }).catch(() => ["Business", "Personal", "Commute"]),
      this._hass.callWS({ type: "mb_logbook/place_labels" }).catch(() => []),
      this._hass.callWS({ type: "mb_logbook/unnamed_places" }).catch(() => []),
      this._hass.callWS({ type: "mb_logbook/ignored_places" }).catch(() => []),
    ]);
    this._placeLabels = placeLabels;
    this._unnamed = unnamed;
    this._ignored = ignored;
    this._rates = rates;
    this._labels = labels;
    this._trips = trips;
    this._charges = charges;
    this._places = places;
    this._open = null;
    this._naming = null;
    this._edit = null;
    this._render();
  }

  /** Places tab: named places and HA zones in one table, each with its default trip label. */
  _placeRows() {
    const admin = this._hass.user?.is_admin;
    const radii = [50, 100, 200, 500, 1000];
    const info = new Map((this._placeLabels || []).map((r) => [r.location, r]));
    const named = new Set(this._places.map((p) => p.name));
    // HA zones (and places since deleted that still have a default) have no circle here,
    // but trips go there, so they get a row for their default label.
    const zones = (this._placeLabels || []).filter((r) => !named.has(r.location));
    const rows = [
      ...this._places.map((p) => ({ place: p, name: p.name, radius: p.radius_m, uses: p.uses, ...this._labelInfo(info, p.name) })),
      ...zones.map((r) => ({ name: r.location, radius: null, uses: r.visits, ...this._labelInfo(info, r.location) })),
    ];
    if (!rows.length)
      return `<tr><td colspan=5 class=empty>No named places yet. Click “unnamed · name it” on a trip or charge to add one.</td></tr>`;
    const labels = [...new Set([...(this._labels || []), ...rows.map((r) => r.label).filter(Boolean)])];
    const labelCell = (r) =>
      admin
        ? `<select class="plabel lsel${r.label ? "" : " none"}" style="--c:var(--mbl-c${this._slot(r.label)})" data-loc="${esc(r.name)}" title="Default label for trips to or from here"><option value="">–</option>${labels
            .map((l) => `<option value="${esc(l)}" ${l === r.label ? "selected" : ""}>${esc(l)}</option>`)
            .join("")}<option value="__other">Other…</option></select>`
        : r.label ? this._chip(r.label) : "–";
    return this._sorted(rows, { name: (r) => r.name, radius: (r) => r.radius, uses: (r) => r.uses, label: (r) => r.label })
      .map((r) => {
        const home = r.is_home ? " <span class=chip>home</span>" : "";
        const p = r.place;
        if (!p)
          return `<tr><td>${esc(r.name)}${home}</td><td>${labelCell(r)}</td><td class=dim>HA zone</td><td class=n>${r.uses}</td><td></td></tr>`;
        const opts = [...new Set([...radii, Math.round(p.radius_m)])]
          .sort((a, b) => a - b)
          .map((x) => `<option value="${x}" ${x === Math.round(p.radius_m) ? "selected" : ""}>${x < 1000 ? x + " m" : x / 1000 + " km"}</option>`)
          .join("");
        return `<tr data-place="${p.id}">
          <td>${admin ? `<input class=pn value="${esc(p.name)}" maxlength=60>` : esc(p.name)}${home}</td>
          <td>${labelCell(r)}</td>
          <td>${admin ? `<select class=pr>${opts}</select>` : Math.round(p.radius_m) + " m"}</td>
          <td class=n>${p.uses}</td>
          <td class="n acts"><button class="btn pmap">${this._openPlace === p.id ? "Hide map" : "Map"}</button>${admin ? `<button class="btn psv">Save</button><button class="btn danger pdel">Delete</button>` : ""}</td>
        </tr>${this._openPlace === p.id ? `<tr class=maprow><td colspan=5><div class="dim">Drag the pin to move this place or the circle's edge to resize it, then press Save.</div><div id=mapbox class=small></div></td></tr>` : ""}`;
      })
      .join("");
  }

  /** Places tab: stops with no place name yet (last 12 months, all cars), most visited first,
   * then the ones the user chose to ignore (folded away, each can be put back). */
  _unnamedSection() {
    const list = (this._unnamed || []).slice(0, 20);
    const ignored = this._ignored || [];
    if (!list.length && !ignored.length) return "";
    const admin = this._hass.user?.is_admin;
    const total = (this._unnamed || []).length;
    const where = (u) => (u.usually_from ? `Usually from ${esc(u.usually_from)}` : `${u.lat.toFixed(4)}, ${u.lon.toFixed(4)}`);
    // "Unnamed place" plus where it is: "2.1 mi NE of Home".
    const unnamedLabel = (u) => {
      const near = this._near(u.lat, u.lon);
      return near ? `Unnamed place <span class=dim>· ${esc(near.text)}</span>` : "Unnamed place";
    };
    const rows = list
      .map((u, i) => {
        const naming = this._naming?.kind === "unnamed" && this._naming.id === i;
        return `<tr><td>${unnamedLabel(u)}<div class=dim>${where(u)}</div></td><td class=n>${u.visits}</td><td>${this._date(u.last_ts)}</td>
            <td class="n acts">${admin ? `<button class="btn sm nameit" data-kind=unnamed data-id="${i}">${naming ? "Naming…" : "Name it"}</button><button class="btn sm quiet ignore" data-id="${i}" title="It doesn't need a name: stop asking">Ignore</button>` : ""}</td></tr>
          ${naming ? `<tr class=maprow><td colspan=4>${this._nameForm(u.lat, u.lon)}<div id=mapbox class=small></div></td></tr>` : ""}`;
      })
      .join("");
    const needs = list.length
      ? `<h3 class=sub>Needs a name <span class=badge>${total}</span></h3>
      <div class=dim>Places the car stopped in the last 12 months that have no name yet, most visited first${total > list.length ? ` (top ${list.length} shown)` : ""}. Ignore one that doesn't need a name.</div>
      <table><thead><tr><th>Place</th><th class=n>Stops</th><th>Last</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : "";
    const ign = ignored.length
      ? `<details class=ignored${this._showIgnored ? " open" : ""}><summary>Ignored places (${ignored.length})</summary>
      <table><thead><tr><th>Place</th><th class=n>Stops</th><th>Last</th><th></th></tr></thead><tbody>${ignored
        .map(
          (u) => `<tr><td>${unnamedLabel(u)}<div class=dim>${where(u)}</div></td><td class=n>${u.visits}</td><td>${this._date(u.last_ts)}</td>
            <td class=n>${admin ? `<button class="btn sm nameit" data-unignore="${u.ignored_id}" title="Ask for a name again">Restore</button>` : ""}</td></tr>`
        )
        .join("")}</tbody></table></details>`
      : "";
    return `${needs}${ign}
      <h3 class=sub>Named places</h3>`;
  }

  /** Default label, trip count and home flag for a place name, from place_labels. */
  _labelInfo(info, name) {
    const r = info.get(name);
    return { label: r?.label || null, visits: r?.visits || 0, is_home: !!r?.is_home };
  }

  /** Nearby named places from OpenStreetMap, only when the user asks. */
  async _suggestNames() {
    const box = this.shadowRoot.getElementById("psuggestions");
    const save = this.shadowRoot.getElementById("psave");
    if (!box || !save) return;
    const e = this._edit;
    const lat = e ? e.lat : Number(save.dataset.lat);
    const lon = e ? e.lon : Number(save.dataset.lon);
    const radius = e ? e.radius : Number(this.shadowRoot.getElementById("pradius")?.value || 100);
    box.innerHTML = `<span class=dim>Asking OpenStreetMap…</span>`;
    let list;
    try {
      list = await this._hass.callWS({ type: "mb_logbook/suggest_names", lat, lon, radius_m: Math.max(radius, 150) });
    } catch (err) {
      box.innerHTML = `<span class=dim>${esc(err.message || err.code || "Lookup failed")}</span>`;
      return;
    }
    if (!list.length) {
      box.innerHTML = `<span class=dim>Nothing named nearby on OpenStreetMap.</span>`;
      return;
    }
    box.innerHTML = list
      .map(
        (s, i) =>
          `<button class=suggestion data-i="${i}" title="${esc(s.kind)}">${esc(s.name)} <span class=dim>${s.distance_m} m${s.kind ? " · " + esc(s.kind) : ""}</span></button>`
      )
      .join("");
    box.querySelectorAll("button.suggestion").forEach((b) =>
      b.addEventListener("click", () => {
        const input = this.shadowRoot.getElementById("pname");
        input.value = list[Number(b.dataset.i)].name;
        input.focus();
      })
    );
  }

  _date(ts) {
    return new Date(ts * 1000).toLocaleDateString(this._hass.locale?.language, { day: "numeric", month: "short", year: "numeric" });
  }

  /** A rate entry as text: "£0.245/kWh · off-peak £0.07 00:30–05:30". Accepts a number too. */
  _rateText(r) {
    const e = typeof r === "number" ? { rate: r } : r;
    if (e.rate === 0 && e.offpeak_rate == null) return "Free";
    const off = e.offpeak_rate != null && e.offpeak_start ? ` · off-peak ${this._money(e.offpeak_rate, true)} ${e.offpeak_start}–${e.offpeak_end}` : "";
    return `${this._money(e.rate, true)}/kWh${off}`;
  }

  /** Places tab: each charging location with its rate history. */
  _rateSection() {
    const r = this._rates;
    if (!r || !r.locations.length) return "";
    const admin = this._hass.user?.is_admin;
    const now = Date.now() / 1000;
    const today = new Date().toISOString().slice(0, 10);
    const rows = r.locations
      .map((loc, i) => {
        const hist = r.rates.filter((x) => x.location === loc.location).sort((a, b) => a.valid_from - b.valid_from);
        const current = [...hist].reverse().find((x) => x.valid_from <= now);
        const cur = current
          ? `${this._rateText(current)} <span class=dim>since ${this._date(current.valid_from)}</span>`
          : `<span class=dim>–</span>`;
        const open = this._openRate === i;
        const histRows = hist.length
          ? hist
              .map(
                (x) => `<div class=ratehist>From ${this._date(x.valid_from)}: <b>${this._rateText(x)}</b>${x.valid_from > now ? " <span class=chip>upcoming</span>" : ""}
                  ${admin ? `<button class="btn sm danger ratedel" data-rate="${x.id}">Delete</button>` : ""}</div>`
              )
              .join("")
          : `<div class=dim>No rates yet. Charges here have no cost${loc.metered && this._car?.has_price ? " unless metered" : ""}.</div>`;
        const form = admin
          ? `<div class=nameform>
               <span>New rate from</span><input type=date class=rdate value="${today}">
               <input type=number class=rrate min=0 max=10000 step=any placeholder="${esc(this._cur)} per kWh, e.g. 0.79">
               <label class=dim><input type=checkbox class=rfree> Free</label>
               <span class=offpeak><span>Off-peak (optional)</span>
                 <input type=number class=roff min=0 max=10000 step=any placeholder="per kWh, e.g. 0.07">
                 <span>from</span><input type=time class=roffs value="00:30"><span>to</span><input type=time class=roffe value="05:30"></span>
               <button class="btn primary rsave" data-loc="${i}">Add rate</button>
               <div class=dim>Charges from that date on use the new rate; earlier charges keep the rate they had. With an off-peak price, each charge is costed by how much of it fell in that window every day.${this._car?.has_price ? " Home charges use your live price sensor instead." : ""}</div>
             </div>`
          : "";
        return `<tr><td>${esc(loc.location)}</td><td>${cur}</td><td class=n>${loc.charges}</td>
            <td class="n acts"><button class="btn pmap" data-rates="${i}">${open ? "Hide" : "Rates"}</button></td></tr>
          ${open ? `<tr class=maprow><td colspan=4>${histRows}${form}</td></tr>` : ""}`;
      })
      .join("");
    return `<h3 class=sub>Charging rates</h3>
      <table><thead><tr><th>Where</th><th>Current rate</th><th class=n>Charges</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /** [[south, west], [north, east]] around a set of [lat, lon] points. */
  _bounds(points) {
    const lats = points.map((p) => p[0]);
    const lons = points.map((p) => p[1]);
    return [
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ];
  }

  _circleBounds(lat, lon, radiusM) {
    const dLat = radiusM / 111320;
    const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
    return this._bounds([
      [lat - dLat, lon - dLon],
      [lat + dLat, lon + dLon],
    ]);
  }

  /** The map does its own first positioning when it finishes loading; fit after that. */
  async _whenLoaded(map) {
    for (let i = 0; i < 60 && !map._loaded; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 150));
  }

  _editable() {
    const e = this._edit;
    return [
      {
        id: "place",
        location: [e.lat, e.lon],
        radius: e.radius,
        title: e.title || "New place",
        locationEditable: true,
        radiusEditable: true,
      },
    ];
  }

  /**
   * Linked stops as map dots. Drawn as a path (part of the map image), not as
   * markers: a marker sitting on the circle's centre pin would take the grab
   * and stop the pin being dragged.
   */
  _anchorPaths() {
    const now = new Date();
    return (this._edit?.anchors || []).map((a) => ({
      color: "var(--warning-color, #f9e2af)",
      gradualOpacity: 0,
      fullDatetime: false,
      name: "Linked stop (keeps this name)",
      points: [0, 1].map(() => ({ timestamp: now, point: [a[0], a[1]], latitude: a[0], longitude: a[1] })),
    }));
  }

  /**
   * Draw a map in #mapbox: an optional route, and an optional place being
   * edited (drag the pin to move it, drag the circle edge to resize it).
   */
  async _drawMap({ paths = [], edit = false } = {}) {
    const box = this.shadowRoot.getElementById("mapbox");
    if (!box) return;
    if (!(await this._ensureMap())) {
      box.innerHTML = `<div class="pad dim">Map unavailable.</div>`;
      return;
    }
    const map = document.createElement("ha-map");
    map.hass = this._hass;
    map.autoFit = false; // we position it ourselves once it has loaded
    map.fitZones = false;
    map.paths = edit ? [...paths, ...this._anchorPaths()] : paths;
    map.editableLocations = edit ? this._editable() : [];
    map.addEventListener("editable-location-moved", (ev) => {
      this._edit.lat = ev.detail.location[0];
      this._edit.lon = ev.detail.location[1];
    });
    map.addEventListener("editable-location-resized", (ev) => {
      this._edit.radius = Math.max(20, Math.round(ev.detail.radius));
      this._syncRadius();
    });
    box.innerHTML = "";
    box.appendChild(map);
    this._map = map;
    await this._whenLoaded(map);
    if (this._map !== map) return; // redrawn meanwhile
    const bounds = edit
      ? this._circleBounds(this._edit.lat, this._edit.lon, this._edit.radius)
      : paths.length
        ? this._bounds(paths.flatMap((p) => p.points.map((q) => [q.latitude, q.longitude])))
        : null;
    if (bounds) {
      map.fitBounds(bounds, { zoom: 17, pad: 0.15 });
      // Naming a place: the route is drawn for context, but the view belongs on the
      // place. ha-map can settle on its paths after our first fit, so fit again.
      if (edit) setTimeout(() => this._map === map && map.fitBounds(bounds, { zoom: 17, pad: 0.15 }), 500);
    }
  }

  /** Radius picked from the list: resize the circle without moving the view. */
  _setEditRadius(r) {
    if (!this._edit) return;
    this._edit.radius = r;
    if (this._map) this._map.editableLocations = this._editable();
  }

  /** Circle dragged to a new size: show it in the radius list. */
  _syncRadius() {
    const sel =
      this.shadowRoot.getElementById("pradius") ||
      this.shadowRoot.querySelector(`tr[data-place="${this._openPlace}"] .pr`);
    if (!sel) return;
    const r = this._edit.radius;
    if (![...sel.options].some((o) => Number(o.value) === r)) {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = `${r} m`;
      sel.appendChild(opt);
    }
    sel.value = String(r);
  }

  _showPlaceMap(place) {
    this._edit = {
      lat: place.lat,
      lon: place.lon,
      radius: Math.round(place.radius_m),
      title: place.name,
      anchors: place.anchors || [],
    };
    this._drawMap({ edit: true });
  }

  /** Map for naming a charge location. */
  _showNamingMap(lat, lon) {
    const r = Number(this.shadowRoot.getElementById("pradius")?.value || 100);
    this._edit = { lat, lon, radius: r, anchors: [[lat, lon]] };
    this._drawMap({ edit: true });
  }

  async _savePlace(body) {
    try {
      await this._hass.callWS({ type: "mb_logbook/place_save", ...body });
      await this._load();
    } catch (e) {
      alert(`Couldn't save the place: ${e.message || e.code || e}`);
    }
  }

  // ----- formatting -----------------------------------------------------------------

  get _miles() {
    return this._car && this._car.unit === "mi";
  }

  _dist(km, digits = 1) {
    if (km == null) return "–";
    const v = this._miles ? km / KM_PER_MI : km;
    return `${v.toFixed(digits)} ${this._miles ? "mi" : "km"}`;
  }

  _kwh(trip) {
    const cap = this._car.capacity_kwh;
    if (!cap || trip.soc_start == null || trip.soc_end == null) return null;
    return Math.max(trip.soc_start - trip.soc_end, 0) / 100 * cap;
  }

  _eff(km, kwh) {
    if (!km || !kwh) return "–";
    return this._miles ? `${(km / KM_PER_MI / kwh).toFixed(1)} mi/kWh` : `${((kwh / km) * 100).toFixed(1)} kWh/100km`;
  }

  _when(ts) {
    const d = new Date(ts * 1000);
    const loc = this._hass.locale?.language || undefined;
    return d.toLocaleString(loc, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  _time(ts) {
    return new Date(ts * 1000).toLocaleTimeString(this._hass.locale?.language || undefined, { hour: "2-digit", minute: "2-digit" });
  }

  _dur(sec) {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
  }

  /** The currency chosen for the car (falls back to Home Assistant's). */
  get _cur() {
    return this._car?.currency || this._hass?.config?.currency || "EUR";
  }

  /** Money in the car's currency, in the user's number format. perKwh: up to 4 decimals, as entered (0.6993, not 0.70). */
  _money(v, perKwh = false) {
    if (v == null) return "–";
    const cur = this._cur;
    try {
      return new Intl.NumberFormat(this._hass.locale?.language, {
        style: "currency",
        currency: cur,
        ...(perKwh ? { maximumFractionDigits: 4 } : {}),
      }).format(v);
    } catch (e) {
      return perKwh ? String(+v.toFixed(4)) : v.toFixed(2);
    }
  }

  /**
   * Context for a stop that has no name: the closest named place or HA zone, with
   * distance and compass direction ("2.1 mi NE of Home"). Worked out from the places
   * already loaded, so nothing leaves Home Assistant. null when there is nothing to go by.
   */
  _near(lat, lon) {
    if (lat == null || lon == null) return null;
    const rad = Math.PI / 180;
    let best = null;
    for (const p of this._places || []) {
      if (p.lat == null || p.lon == null || !p.name) continue;
      const a =
        Math.sin(((p.lat - lat) * rad) / 2) ** 2 +
        Math.cos(lat * rad) * Math.cos(p.lat * rad) * Math.sin(((p.lon - lon) * rad) / 2) ** 2;
      const m = 12742000 * Math.asin(Math.sqrt(a));
      if (!best || m < best.m) best = { m, p };
    }
    if (!best) return null;
    // Bearing from the named place out to the stop.
    const { p } = best;
    const dLon = (lon - p.lon) * rad;
    const y = Math.sin(dLon) * Math.cos(lat * rad);
    const x = Math.cos(p.lat * rad) * Math.sin(lat * rad) - Math.sin(p.lat * rad) * Math.cos(lat * rad) * Math.cos(dLon);
    const deg = (Math.atan2(y, x) / rad + 360) % 360;
    const dir = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
    return { name: p.name, text: `${this._dist(best.m / 1000)} ${dir} of ${p.name}` };
  }

  _place(name, lat, kind, id, end, lon) {
    if (name) return esc(name);
    if (lat == null) return "–";
    const near = this._near(lat, lon);
    const hint = near ? ` near ${esc(near.name)}` : "";
    if (!this._hass.user?.is_admin) return `<span class=dim>unnamed${hint}</span>`;
    return `<button class="btn sm dashed nameit" data-kind="${kind}" data-id="${id}" data-end="${end || ""}"${near ? ` title="${esc(near.text)}"` : ""}>unnamed${hint} · name it</button>`;
  }

  _nameForm(lat, lon) {
    const radii = [50, 100, 200, 500, 1000]
      .map((r) => `<option value="${r}" ${r === 100 ? "selected" : ""}>${r < 1000 ? r + " m" : "1 km"}</option>`)
      .join("");
    const names = [...new Set((this._places || []).map((p) => p.name))]
      .map((n) => `<option value="${esc(n)}"></option>`)
      .join("");
    return `<div class=nameform>
        <span>Name this place</span>
        <input id=pname list=pnames maxlength=60 placeholder="e.g. Mum's, Tesco Extra" autocomplete=off>
        <datalist id=pnames>${names}</datalist>
        <select id=pradius title="Anything within this distance gets the name">${radii}</select>
        <button class="btn primary" id=psave data-lat="${lat}" data-lon="${lon}">Save</button>
        <button class=btn id=pcancel>Cancel</button>
        <button class=btn id=psuggest title="Asks OpenStreetMap for named places near the pin. Only this point is sent.">Suggest names</button>
        <button class="btn quiet" id=pignore title="It doesn't need a name: stop asking about it on the Places tab">Ignore</button>
        <div id=psuggestions class=suggestions></div>
        <div class=dim>Drag the pin on the map to move the place, or the circle's edge to resize it. This stop (the small dot) always keeps the name, even if the GPS put it outside the circle. The name also applies to every trip and charge inside the circle or near the dot, past and future. Using a name you already have links this stop to that place.</div>
      </div>`;
  }

  // ----- summary ----------------------------------------------------------------------

  _summary() {
    if (this._tab === "places") return "";
    const tiles = this._tab === "charges" ? this._chargeTiles() : this._tripTiles();
    return `<div class=tiles>${tiles.map(([k, v, i]) => `<div class=tile>${icon(i, "ti")}<div><div class=k>${k}</div><div class=v>${v}</div></div></div>`).join("")}</div>`;
  }

  _chargeTiles() {
    const ch = this._shownCharges;
    const kwh = ch.reduce((s, c) => s + (c.kwh ?? c.kwh_meter ?? c.kwh_car ?? 0), 0);
    // Costed charges: metered at home, or at a charging place's rate (free counts as 0).
    const costed = ch.filter((c) => c.cost != null);
    const cKwh = costed.reduce((s, c) => s + (c.kwh ?? c.kwh_meter ?? c.kwh_car ?? 0), 0);
    const cost = costed.reduce((s, c) => s + c.cost, 0);
    const uncosted = ch.length - costed.length;
    return [
      ["Sessions", ch.length, "station"],
      ["Energy added", kwh ? `${kwh.toFixed(0)} kWh` : "–", "bolt"],
      ["At home", ch.filter((c) => c.at_home).length, "home"],
      ["Charging cost", costed.length ? this._money(cost) + (uncosted ? ` <small class=dim>+${uncosted} unpriced</small>` : "") : "–", "cash"],
      ["Average per kWh", cKwh ? this._money(cost / cKwh, true) : "–", "tag"],
    ];
  }

  _tripTiles() {
    const t = this._shownTrips;
    const km = t.reduce((s, x) => s + x.distance_km, 0);
    let kwh = 0;
    let kmKnown = 0;
    for (const x of t) {
      const k = this._kwh(x);
      if (k) {
        kwh += k;
        kmKnown += x.distance_km;
      }
    }
    // Battery % only comes in whole steps, so pool the parks (total lost over
    // total time) rather than averaging per-park rates that are mostly 0.
    const dh = (x) => x.park_drain_hours ?? (x.park_charged ? null : x.park_hours);
    const parks = t.filter((x) => x.park_soc_drop != null && dh(x) >= 6);
    const hours = parks.reduce((s, x) => s + dh(x), 0);
    const drain = hours ? (parks.reduce((s, x) => s + x.park_soc_drop, 0) / hours) * 24 : null;
    return [
      ["Trips", t.length, "car"],
      ["Distance", this._dist(km, 0), "distance"],
      ["Energy used", kwh ? `${kwh.toFixed(0)} kWh` : "–", "bolt"],
      ["Efficiency", this._eff(kmKnown, kwh), "eff"],
      ["Idle drain", drain != null ? `${drain.toFixed(2)} %/day` : "–", "drain"],
    ];
  }

  // ----- tables -----------------------------------------------------------------------

  /** Trips after the label filter and the column filters. */
  get _shownTrips() {
    const f = this._labelFilter || "all";
    const { route, dist, park } = this._cf.trips;
    const k = this._miles ? 1 / KM_PER_MI : 1;
    return this._trips.filter((t) => {
      if (f === "__none" ? t.label : f !== "all" && t.label !== f) return false;
      if (route && !(route === "__none" ? !t.start_place || !t.end_place : t.start_place === route || t.end_place === route)) return false;
      if (dist) {
        const [lo, hi] = DIST_BANDS.find(([v]) => v === dist).slice(2);
        const d = t.distance_km * k;
        if (d < lo || d >= hi) return false;
      }
      if (park && (park === "charged") !== !!t.park_charged) return false;
      return true;
    });
  }

  /** Charges after the column filters. */
  get _shownCharges() {
    const { where, cost } = this._cf.charges;
    return this._charges.filter((c) => {
      if (where === "__home" ? !c.at_home : where === "__away" ? c.at_home : where === "__none" ? c.place : where && c.place !== where) return false;
      if (cost && (c.cost_source || (c.cost == null ? "none" : "")) !== cost) return false;
      return true;
    });
  }

  get _filtering() {
    return this._tab === "charges"
      ? Object.values(this._cf.charges).some(Boolean)
      : this._labelFilter !== "all" || Object.values(this._cf.trips).some(Boolean);
  }

  /** The current tab's filters: [key, name, label when off, [[value, label], ...]]. */
  _filterDefs() {
    if (this._tab === "charges") {
      const places = [...new Set(this._charges.map((c) => c.place).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      const bases = [["meter", "Metered"], ["power", "Live price"], ["rate", "Place rate"], ["free", "Free"], ["none", "No rate"]];
      return [
        ["where", "Where", "Anywhere", [["__home", "At home"], ["__away", "Away from home"], ...places.map((p) => [p, p]), ["__none", "Unnamed places"]]],
        ["cost", "Cost", "Any cost", bases.filter(([v]) => this._charges.some((c) => (c.cost_source || (c.cost == null ? "none" : "")) === v))],
      ];
    }
    const unit = this._miles ? "mi" : "km";
    const places = [...new Set(this._trips.flatMap((t) => [t.start_place, t.end_place]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return [
      ["route", "Place", "Any place", [...places.map((p) => [p, `To or from ${p}`]), ["__none", "Unnamed places"]]],
      ["dist", "Distance", "Any distance", DIST_BANDS.map(([v, l]) => [v, `${l} ${unit}`])],
      ["park", "Parked before", "Any park", [["charged", "Charged"], ["notcharged", "Not charged"]]],
    ];
  }

  /** The current tab's sortable columns: [key, heading, numeric]. */
  _sortDefs() {
    return this._tab === "charges"
      ? [["start", "Start"], ["where", "Where"], ["soc", "Battery", 1], ["kwh", "Energy", 1], ["peak", "Peak", 1], ["cost", "Cost", 1], ["perkwh", "Per kWh", 1]]
      : [["start", "Start"], ["route", "Route"], ["label", "Label"], ["dist", "Distance", 1], ["used", "Battery", 1], ["kwh", "Used", 1], ["eff", "Efficiency", 1], ["park", "Parked before", 1]];
  }

  /** The Filter button, a chip for each filter that is on, and the panel the button opens.
   * The panel also holds the sort order, for a narrow card where the column headers are hidden. */
  _filterUi() {
    const defs = this._filterDefs();
    const cf = this._cf[this._tab];
    const on = defs.filter(([k]) => cf[k]);
    const btn = `<button class="btn fbtn${this._showFilters ? " open" : ""}" aria-expanded="${!!this._showFilters}" title="Filter and sort the list">${icon("filter")}Filter${on.length ? ` <span class=count>${on.length}</span>` : ""}</button>`;
    const chips = on
      .map(([k, , , opts]) => `<button class=fchip data-cfx="${k}" title="Remove this filter">${esc(opts.find(([v]) => v === cf[k])?.[1] || cf[k])}${icon("close")}</button>`)
      .join("");
    if (!this._showFilters) return { btn, chips, panel: "" };
    const s = this._sort[this._tab];
    const field = (name, body) => `<label><span>${name}</span>${body}</label>`;
    const panel = `<div class=fpanel>${defs
      .map(([k, name, all, opts]) =>
        field(name, `<select class="cf${cf[k] ? " on" : ""}" data-cf="${k}"><option value="">${esc(all)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cf[k] ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`)
      )
      .join("")}${field("Sort by", `<select class=sortsel><option value="">Newest first</option>${this._sortDefs()
      .slice(1)
      .map(([k, l]) => `<option value="${k}" ${s?.key === k ? "selected" : ""}>${esc(l)}</option>`)
      .join("")}</select>`)}</div>`;
    return { btn, chips, panel };
  }

  _labelCell(x) {
    if (!this._hass.user?.is_admin)
      return x.label ? this._chip(x.label, x.label_auto) : "";
    const opts = [...new Set([...(this._labels || []), ...(x.label ? [x.label] : [])])];
    // "" = no label of its own: shows the place's default ("auto: …") if there is one.
    const manual = x.label_auto ? null : x.label;
    return `<select class="tlabel lsel${x.label_auto ? " auto" : ""}${x.label ? "" : " none"}" style="--c:var(--mbl-c${this._slot(x.label)})" data-id="${x.id}" title="${x.label_auto ? "From the place's default label; pick one to override" : ""}">
        <option value="">${x.label_auto ? `auto: ${esc(x.label)}` : "–"}</option>
        ${opts.map((l) => `<option value="${esc(l)}" ${l === manual ? "selected" : ""}>${esc(l)}</option>`).join("")}
        <option value="__other">Other…</option>
      </select>`;
  }

  /** Label filter, per-label distance and CSV export, above the trips table. */
  _labelBar() {
    const present = [...new Set(this._trips.map((t) => t.label).filter(Boolean))];
    const filters = [["all", "All"], ...present.map((l) => [l, l]), ["__none", "Unlabelled"]];
    const f = this._labelFilter || "all";
    const byLabel = present
      .map((l) => `<span class=ltotal><i style="background:var(--mbl-c${this._slot(l)})"></i>${esc(l)} <b>${this._dist(this._trips.filter((t) => t.label === l).reduce((s, t) => s + t.distance_km, 0))}</b></span>`)
      .join("");
    const fu = this._filterUi();
    return `<div class=labelbar>
        <div class="seg sm">${filters.map(([v, l]) => `<button data-lfilter="${esc(v)}" class="${v === f ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
        <span class=ltotals>${byLabel}</span>
        <div class=tools>${fu.chips}
        ${this._filtering ? `<button class="btn quiet cfclear" title="Show all trips again">Clear</button>` : ""}
        ${fu.btn}
        <button class="btn csv" title="Download the trips shown, for mileage claims">${icon("download")}Export CSV</button></div>
      </div>${fu.panel}`;
  }

  _exportCsv() {
    const unit = this._miles ? "mi" : "km";
    const k = this._miles ? 1 / KM_PER_MI : 1;
    const loc = this._hass.locale?.language;
    const rows = [["Date", "Start time", "End time", "From", "To", `Distance (${unit})`, `Odometer start (${unit})`, `Odometer end (${unit})`, "Label", "Battery start %", "Battery end %", "Note"]];
    for (const t of [...this._shownTrips].sort((a, b) => a.start_ts - b.start_ts)) {
      const s = new Date(t.start_ts * 1000);
      const e = new Date(t.end_ts * 1000);
      rows.push([
        s.toLocaleDateString(loc),
        s.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }),
        e.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }),
        t.start_place || (t.start_lat != null ? `${t.start_lat.toFixed(5)}, ${t.start_lon.toFixed(5)}` : ""),
        t.end_place || (t.end_lat != null ? `${t.end_lat.toFixed(5)}, ${t.end_lon.toFixed(5)}` : ""),
        (t.distance_km * k).toFixed(1),
        t.odo_start_km != null ? (t.odo_start_km * k).toFixed(0) : "",
        t.odo_end_km != null ? (t.odo_end_km * k).toFixed(0) : "",
        t.label || "",
        t.soc_start ?? "",
        t.soc_end ?? "",
        t.gap ? "Missed while Home Assistant was offline: distance from the odometer, time approximate" : "",
      ]);
    }
    const f = this._labelFilter && this._labelFilter !== "all" ? `-${this._labelFilter === "__none" ? "unlabelled" : this._labelFilter}` : "";
    this._download(rows, `trips${f}`);
  }

  _exportChargesCsv() {
    const loc = this._hass.locale?.language;
    const cur = this._cur;
    const rows = [["Date", "Start time", "End time", "Place", "Latitude", "Longitude", "Battery start %", "Battery end %", "Energy (kWh)", "Energy source", "Peak power (kW)", `Cost (${cur})`, "Cost basis", `Per kWh (${cur})`, "Connector", "Plugged in", "Unplugged"]];
    for (const c of [...this._shownCharges].sort((a, b) => a.start_ts - b.start_ts)) {
      const s = new Date(c.start_ts * 1000);
      const e = new Date(c.end_ts * 1000);
      const kwh = c.kwh ?? c.kwh_meter ?? c.kwh_car;
      const per = c.cost_source === "rate" || c.cost_source === "free" ? c.rate : c.kwh && c.cost ? c.cost / c.kwh : null;
      rows.push([
        s.toLocaleDateString(loc),
        s.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }),
        e.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }),
        c.place || "",
        c.lat != null ? c.lat.toFixed(5) : "",
        c.lon != null ? c.lon.toFixed(5) : "",
        c.soc_start ?? "",
        c.soc_end ?? "",
        kwh != null ? kwh.toFixed(2) : "",
        SRC[c.kwh_source] || "from battery %",
        c.max_power_kw ? c.max_power_kw.toFixed(1) : "",
        c.cost != null ? c.cost.toFixed(2) : "",
        { meter: "metered", power: "live price", rate: "place rate", free: "free" }[c.cost_source] || "",
        per != null ? per.toFixed(3) : "",
        c.connector || "",
        c.plugged_ts ? new Date(c.plugged_ts * 1000).toLocaleString(loc) : "",
        c.unplugged_ts ? new Date(c.unplugged_ts * 1000).toLocaleString(loc) : "",
      ]);
    }
    this._download(rows, "charges");
  }

  /** Save rows as a CSV named after the car, what it holds and the period. */
  _download(rows, what) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = rows.map((r) => r.map(q).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${this._car.name}-${what}-${this._range().label.replace(/[^\w]+/g, "-")}.csv`.toLowerCase();
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  /** A charging session shown in the trip list, between the trips around it. */
  _chargeLine(c) {
    const kwh = c.kwh ?? c.kwh_meter ?? c.kwh_car;
    const t = (ts) => this._time(ts);
    const bits = [
      `${t(c.start_ts)}–${t(c.end_ts)}`,
      `${c.soc_start ?? "–"}→${c.soc_end ?? "–"}%`,
      kwh != null ? `${kwh.toFixed(1)} kWh` : null,
      c.cost ? this._money(c.cost) : null,
    ].filter(Boolean);
    const near = c.place ? null : this._near(c.lat, c.lon);
    const where = c.place ? esc(c.place) : `unnamed place${near ? ` near ${esc(near.name)}` : ""}`;
    return `<tr class=chargeline><td colspan=9>${icon("bolt")}Charged at ${where} <span class=dim>· ${bits.join(" · ")}</span></td></tr>`;
  }

  /** A clickable column header that sorts the current tab's table. */
  _th(key, label, num) {
    const s = this._sort[this._tab];
    const arrow = s && s.key === key ? icon(s.dir > 0 ? "up" : "down") : "";
    return `<th class="sort${num ? " n" : ""}${arrow ? " on" : ""}" data-sort="${key}" title="Sort by ${esc(label.toLowerCase())}">${esc(label)}${arrow}</th>`;
  }

  /** Sort a copy of rows by the tab's chosen column; blanks always last. */
  _sorted(rows, keys) {
    const s = this._sort[this._tab];
    const f = s && keys[s.key];
    if (!f) return rows;
    return [...rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      if (x == null || x === "") return y == null || y === "" ? 0 : 1;
      if (y == null || y === "") return -1;
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * s.dir;
    });
  }

  _tripRows() {
    const trips = this._shownTrips;
    if (!trips.length) return `<tr class=plain><td colspan=9 class=empty>No trips${this._filtering ? " matching the filters" : ""} in this period.</td></tr>`;
    // Newest first, with each charge placed between the trips it fell between
    // (charges only when not filtering by label).
    // A column sort drops the charge lines, which only make sense in time order.
    const items = this._sort.trips
      ? this._sorted(trips, {
          start: (x) => x.start_ts,
          route: (x) => `${x.start_place || "zzzz"} → ${x.end_place || "zzzz"}`, // unnamed last
          label: (x) => x.label || null,
          dist: (x) => x.distance_km,
          used: (x) => (x.soc_start != null && x.soc_end != null ? x.soc_start - x.soc_end : null),
          kwh: (x) => this._kwh(x) || null,
          eff: (x) => (this._kwh(x) && x.distance_km ? x.distance_km / this._kwh(x) : null),
          park: (x) => x.park_hours,
        }).map((x) => ({ trip: x }))
      : [
          ...trips.map((x) => ({ ts: x.start_ts, trip: x })),
          ...(this._filtering ? [] : this._charges).map((c) => ({ ts: c.start_ts, charge: c })),
        ].sort((a, b) => b.ts - a.ts);
    return items
      .map(({ trip: x, charge }) => {
        if (charge) return this._chargeLine(charge);
        const kwh = this._kwh(x);
        const used = x.soc_start != null && x.soc_end != null ? `${x.soc_start}→${x.soc_end}%` : "–";
        let park = "–";
        if (x.park_hours != null) {
          const h = x.park_hours >= 48 ? `${(x.park_hours / 24).toFixed(1)} d` : `${x.park_hours.toFixed(1)} h`;
          // Drain is measured after any charge, so a charged park can still show it.
          const d = x.park_soc_drop;
          const drain = d == null ? "" : d > 0 ? ` · −${d}%` : d < 0 ? ` · +${-d}%` : " · 0%";
          park = `${h}${x.park_charged ? " <span class=chip>charged</span>" : ""}${drain}`;
        }
        const open = this._open === x.id;
        const naming = this._naming && this._naming.kind === "trip" && this._naming.id === x.id ? this._naming : null;
        const form = naming
          ? this._nameForm(naming.end === "start" ? x.start_lat : x.end_lat, naming.end === "start" ? x.start_lon : x.end_lon)
          : "";
        return `<tr class="trip ${open ? "open" : ""}" data-id="${x.id}">
            <td class=c-when>${this._when(x.start_ts)}<div class=dim>${x.gap ? `<span class=chip title="Driven while Home Assistant wasn't watching (offline, or the car's connection was down). The distance is from the odometer; the drive was some time between ${this._time(x.start_ts)} and ${this._time(x.end_ts)}, and there is no route. Several drives may be in one.">missed</span> by ${this._time(x.end_ts)}` : this._dur(x.end_ts - x.start_ts)}</div></td>
            <td class=c-route>${this._place(x.start_place, x.start_lat, "trip", x.id, "start", x.start_lon)} → ${this._place(x.end_place, x.end_lat, "trip", x.id, "end", x.end_lon)}</td>
            <td class=c-label>${this._labelCell(x)}</td>
            <td class="n c-dist">${this._dist(x.distance_km)}</td>
            <td class="n c-x">${used}</td>
            <td class="n c-x">${kwh ? kwh.toFixed(1) + " kWh" : "–"}</td>
            <td class="n c-x">${this._eff(x.distance_km, kwh)}</td>
            <td class="n c-x">${park}</td>
            <td class="n dim c-x">${x.point_count > 1 ? `<span title="Route recorded: click the row for the map">${icon("route")}</span>` : ""}</td>
            <td class=c-meta>${[used !== "–" && used, kwh && `${kwh.toFixed(1)} kWh`, kwh && this._eff(x.distance_km, kwh), park !== "–" && `parked ${park}`].filter(Boolean).join(" · ")}</td>
          </tr>${open ? `<tr class=maprow><td colspan=9>${form}<div id=mapbox></div>${naming ? "" : this._tripFigures(x)}${this._hass.user?.is_admin && !naming ? `<div class=tripactions>${x.end_ts - x.start_ts >= 2400 ? `<button class="btn splittrip" data-id="${x.id}" title="For two drives logged as one: splits at the longest stop">Split at the stop</button>` : ""}<button class="btn mergetrip" data-id="${x.id}" title="For one drive logged as two: joins this trip with the one after it">Merge with next trip</button><button class="btn danger deltrip" data-id="${x.id}">Delete this trip</button></div>` : ""}</td></tr>` : ""}`;
      })
      .join("");
  }

  /** The opened trip's figures, under its map. */
  _tripFigures(x) {
    const kwh = this._kwh(x);
    const secs = x.end_ts - x.start_ts;
    const k = this._miles ? 1 / KM_PER_MI : 1;
    const figs = [
      ["Time", x.gap ? `by ${this._time(x.end_ts)}` : `${this._time(x.start_ts)} – ${this._time(x.end_ts)}`],
      ["Distance", this._dist(x.distance_km)],
      x.gap ? null : ["Duration", this._dur(secs)],
      !x.gap && secs > 60 ? ["Average speed", `${((x.distance_km * k) / (secs / 3600)).toFixed(0)} ${this._miles ? "mph" : "km/h"}`] : null,
      x.soc_start != null && x.soc_end != null ? ["Battery", `${x.soc_start}→${x.soc_end}%`] : null,
      kwh ? ["Energy used", `${kwh.toFixed(1)} kWh`] : null,
      kwh ? ["Efficiency", this._eff(x.distance_km, kwh)] : null,
      x.odo_end_km != null ? ["Odometer", this._dist(x.odo_end_km, 0)] : null,
      x.temp_c != null ? ["Outside", `${Math.round(x.temp_c)}°C`] : null,
    ].filter(Boolean);
    return `<div class=tfigs>${figs.map(([a, b]) => `<div><div class=k>${a}</div><div class=fv>${b}</div></div>`).join("")}</div>`;
  }

  /** When the cable went in and came out, from the car's plug sensors. */
  _plugged(c) {
    if (!c.plugged_ts && !c.unplugged_ts) return "";
    const t = (ts) => (ts ? this._time(ts) : "?");
    const text = c.unplugged_ts ? `plugged ${t(c.plugged_ts)}–${t(c.unplugged_ts)}` : `plugged in ${t(c.plugged_ts)}`;
    return `<div class=dim title="When the cable was connected at both ends, and when it came out">${text}</div>`;
  }

  _chargeRows() {
    const shown = this._shownCharges;
    if (!shown.length) return `<tr class=plain><td colspan=7 class=empty>No charging sessions${this._filtering ? " matching the filters" : ""} in this period.</td></tr>`;
    return this._sorted(shown, {
      start: (c) => c.start_ts,
      where: (c) => c.place || null,
      soc: (c) => (c.soc_start != null && c.soc_end != null ? c.soc_end - c.soc_start : null),
      kwh: (c) => c.kwh ?? c.kwh_meter ?? c.kwh_car,
      peak: (c) => c.max_power_kw || null,
      cost: (c) => c.cost,
      perkwh: (c) => (c.cost_source === "rate" || c.cost_source === "free" ? c.rate : c.kwh && c.cost ? c.cost / c.kwh : null),
    })
      .map((c) => {
        const kwh = c.kwh ?? c.kwh_meter ?? c.kwh_car;
        const src = SRC[c.kwh_source] || (c.kwh_meter != null ? "metered" : "from battery %");
        const naming = this._naming && this._naming.kind === "charge" && this._naming.id === c.id;
        const formRow = naming
          ? `<tr class=maprow><td colspan=7>${this._nameForm(c.lat, c.lon)}<div id=mapbox class=small></div></td></tr>`
          : "";
        const basis = { meter: "metered", power: "live price", rate: "place rate", free: "free" }[c.cost_source] || (c.cost == null ? "no rate" : "");
        const per = c.cost_source === "rate" || c.cost_source === "free" ? this._money(c.rate, true) : c.kwh && c.cost ? this._money(c.cost / c.kwh, true) : "";
        const meta = [
          `${c.soc_start ?? "–"}→${c.soc_end ?? "–"}%`,
          c.max_power_kw ? `${c.max_power_kw.toFixed(1)} kW${c.connector ? " " + esc(c.connector) : ""}` : null,
          `energy ${src}`,
          c.cost != null && basis !== "free" ? `cost ${basis}` : null,
          per && basis !== "free" ? `${per}/kWh` : null,
        ].filter(Boolean).join(" · ");
        return `<tr class=charge>
          <td class=c-when>${this._when(c.start_ts)}<div class=dim>${this._dur(c.end_ts - c.start_ts)}</div>${this._plugged(c)}</td>
          <td class=c-route>${this._place(c.place, c.lat, "charge", c.id, undefined, c.lon)}${c.at_home ? " <span class=chip>home</span>" : ""}</td>
          <td class="n c-x">${c.soc_start ?? "–"}→${c.soc_end ?? "–"}%</td>
          <td class="n c-label">${kwh != null ? kwh.toFixed(1) + " kWh" : "–"}<div class=dim>${src}</div></td>
          <td class="n c-x">${c.max_power_kw ? c.max_power_kw.toFixed(1) + " kW" : "–"}${c.connector ? `<div class=dim>${esc(c.connector)}</div>` : ""}</td>
          <td class="n c-dist">${c.cost == null ? `<span class=dim>no rate</span>` : this._money(c.cost)}<div class=dim>${c.cost == null ? "" : basis}</div></td>
          <td class="n c-x">${per}</td>
          <td class=c-meta>${meta}</td>
        </tr>${formRow}`;
      })
      .join("");
  }

  // ----- render -----------------------------------------------------------------------

  _render() {
    const root = this.shadowRoot;
    if (this._error) {
      root.innerHTML = `<ha-card><div class=pad>${esc(this._error)}</div></ha-card>`;
      return;
    }
    const cars =
      this._cars.length > 1 && !this._config.entry_id
        ? `<div class=seg>${this._cars
            .map((c) => `<button data-car="${c.entry_id}" class="${c.entry_id === this._car.entry_id ? "on" : ""}">${esc(c.name)}${c.trip_active ? " •" : ""}</button>`)
            .join("")}</div>`
        : "";
    const periods =
      this._tab === "places"
        ? "<div></div>"
        : `<div class=periodbar><div class=seg>${PERIODS.map(([v, l]) => `<button data-period="${v}" class="${v === this._period ? "on" : ""}">${l}</button>`).join("")}</div>
           <div class=stepper><button class=step data-step="1" title="Previous" aria-label="Previous">${icon("left")}</button><span class=range>${esc(this._range().label)}</span><button class=step data-step="-1" title="Next" aria-label="Next" ${this._offset === 0 ? "disabled" : ""}>${icon("right")}</button></div></div>`;
    const unnamed = (this._unnamed || []).length;
    const tabs = `<div class=seg>${[["trips", "Trips"], ["charges", "Charging"], ["places", "Places"]]
      .map(([v, l]) => `<button data-tab="${v}" class="${v === this._tab ? "on" : ""}">${l}${v === "places" && unnamed ? ` <span class=badge title="${unnamed} unnamed place${unnamed === 1 ? "" : "s"}">${unnamed > 99 ? "99+" : unnamed}</span>` : ""}</button>`)
      .join("")}</div>`;
    const clear = this._filtering ? `<button class="btn quiet cfclear" title="Show all rows again">Clear</button>` : "";
    const heads = this._tab === "places" ? "" : this._sortDefs().map(([k, l, num]) => this._th(k, l, num)).join("");
    const fu = this._tab === "charges" ? this._filterUi() : null;
    const table =
      this._tab === "trips"
        ? `${this._labelBar()}<table class=cards><thead><tr>${heads}<th></th></tr></thead><tbody>${this._tripRows()}</tbody></table>`
        : this._tab === "charges"
          ? `${this._charges.length ? `<div class=labelbar><div class=tools>${fu.chips}${clear}${fu.btn}<button class="btn csv csvc" title="Download the charging sessions shown">${icon("download")}Export CSV</button></div></div>${fu.panel}` : ""}<table class=cards><thead><tr>${heads}</tr></thead><tbody>${this._chargeRows()}</tbody></table>
             ${this._rateSection()}`
          : `${this._unnamedSection()}<table><thead><tr>${this._th("name", "Name")}${this._th("label", "Default label")}${this._th("radius", "Radius")}${this._th("uses", "Trip ends / charges", 1)}<th></th></tr></thead><tbody>${this._placeRows()}</tbody></table>
             <div class="dim pad">Named places are shared by all cars. Home Assistant zones take priority where they overlap.
             Trips with no label of their own take the default of where they end, or else where they start (so Home → Work and Work → Home both count). Labels you pick on a trip always win.</div>`;
    root.innerHTML = `<style>${MBLogbookCard.css}</style>
      <ha-card><div class=wrap>
        <div class=head><div class=title>${esc(this._config.title || this._car.name + " logbook")}${this._car.trip_active ? ' <span class="chip live">driving</span>' : ""}${this._car.charge_active ? ' <span class="chip live">charging</span>' : ""}</div>${cars}</div>
        <div class=bar>${periods}${tabs}</div>
        ${this._summary()}
        <div class=scroll>${table}</div>
      </div></ha-card>`;
    root.querySelectorAll("button[data-car]").forEach((b) =>
      b.addEventListener("click", () => {
        this._car = this._cars.find((c) => c.entry_id === b.dataset.car);
        this._load();
      })
    );
    root.querySelectorAll("button[data-period]").forEach((b) =>
      b.addEventListener("click", () => {
        this._period = b.dataset.period;
        this._offset = 0;
        this._load();
      })
    );
    root.querySelectorAll("button[data-step]").forEach((b) =>
      b.addEventListener("click", () => {
        this._offset = Math.max(0, this._offset + Number(b.dataset.step));
        this._load();
      })
    );
    root.querySelectorAll("button[data-tab]").forEach((b) =>
      b.addEventListener("click", () => {
        this._tab = b.dataset.tab;
        this._naming = null;
        this._open = null;
        this._openPlace = null;
        this._render();
      })
    );
    // Header click: sort (text A→Z, numbers biggest first), click again to reverse, a third time to reset.
    root.querySelectorAll("th[data-sort]").forEach((th) =>
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        const cur = this._sort[this._tab];
        const first = th.classList.contains("n") ? -1 : 1;
        if (!cur || cur.key !== key) this._sort[this._tab] = { key, dir: first };
        else if (cur.dir === first) cur.dir = -first;
        else delete this._sort[this._tab];
        this._open = null;
        this._naming = null;
        this._openPlace = null;
        this._render();
      })
    );
    root.querySelectorAll("tr.trip").forEach((tr) =>
      tr.addEventListener("click", () => {
        const id = Number(tr.dataset.id);
        this._open = this._open === id ? null : id;
        this._naming = null;
        this._render();
        if (this._open != null) this._showMap(this._open);
      })
    );
    root.querySelectorAll("select.plabel").forEach((s) =>
      s.addEventListener("change", async () => {
        const loc = s.dataset.loc;
        const row = this._labelInfo(new Map((this._placeLabels || []).map((r) => [r.location, r])), loc);
        let label = s.value;
        if (label === "__other") {
          label = (prompt(`Default label for trips to and from ${loc}:`) || "").trim().slice(0, 30);
          if (!label) return this._render();
        }
        // Nearly every trip starts or ends at home, so check before labelling them all.
        if (label && row.is_home &&
            !confirm(`${loc} is your home zone: ${row.visits} trips start or end there, so a default here would label almost all of them "${label}". Trips with their own label keep it.\n\nGive ${loc} this default anyway?`)) {
          return this._render();
        }
        try {
          await this._hass.callWS({ type: "mb_logbook/place_label_set", location: loc, label: label || null });
        } catch (e) {
          alert(`Couldn't save the default label: ${e.message || e.code || e}`);
        }
        await this._load();
      })
    );
    root.querySelectorAll("button[data-rates]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.rates);
        this._openRate = this._openRate === i ? null : i;
        this._render();
      })
    );
    root.querySelectorAll("button.rsave").forEach((b) =>
      b.addEventListener("click", async () => {
        const row = b.closest("td");
        const loc = this._rates.locations[Number(b.dataset.loc)].location;
        const free = row.querySelector(".rfree").checked;
        const rate = free ? 0 : Number(row.querySelector(".rrate").value);
        const date = row.querySelector(".rdate").value;
        if (!date || (!free && !(rate > 0))) return alert("Enter a rate per kWh (or tick Free) and a start date.");
        const msg = { type: "mb_logbook/rate_save", location: loc, valid_from: date, rate };
        const offRate = row.querySelector(".roff").value;
        if (!free && offRate !== "") {
          const from = row.querySelector(".roffs").value;
          const to = row.querySelector(".roffe").value;
          if (!from || !to || from === to) return alert("Give the off-peak window a start and end time (for example 00:30 to 05:30).");
          Object.assign(msg, { offpeak_rate: Number(offRate), offpeak_start: from, offpeak_end: to });
        }
        try {
          await this._hass.callWS(msg);
        } catch (e) {
          return alert(`Couldn't save the rate: ${e.message || e.code || e}`);
        }
        const keep = this._openRate;
        await this._load();
        this._openRate = keep;
        this._render();
      })
    );
    root.querySelectorAll("button.ratedel").forEach((b) =>
      b.addEventListener("click", async () => {
        if (!confirm("Delete this rate? Charges it covered will use the rate before it (or none).")) return;
        await this._hass.callWS({ type: "mb_logbook/rate_delete", rate_id: Number(b.dataset.rate) });
        const keep = this._openRate;
        await this._load();
        this._openRate = keep;
        this._render();
      })
    );
    root.querySelectorAll("button[data-lfilter]").forEach((b) =>
      b.addEventListener("click", () => {
        this._labelFilter = b.dataset.lfilter;
        this._open = null;
        this._render();
      })
    );
    root.querySelectorAll("select.cf").forEach((s) =>
      s.addEventListener("change", () => {
        if (s.dataset.cf === "label") this._labelFilter = s.value || "all";
        else this._cf[this._tab][s.dataset.cf] = s.value || undefined;
        this._open = null;
        this._naming = null;
        this._render();
      })
    );
    root.querySelector("button.fbtn")?.addEventListener("click", () => {
      this._showFilters = !this._showFilters;
      this._render();
    });
    root.querySelectorAll("button.fchip").forEach((b) =>
      b.addEventListener("click", () => {
        this._cf[this._tab][b.dataset.cfx] = undefined;
        this._open = null;
        this._naming = null;
        this._render();
      })
    );
    // Same as a first click on that column's heading: text A to Z, numbers biggest first.
    root.querySelector("select.sortsel")?.addEventListener("change", (e) => {
      const def = this._sortDefs().find(([k]) => k === e.target.value);
      if (def) this._sort[this._tab] = { key: def[0], dir: def[2] ? -1 : 1 };
      else delete this._sort[this._tab];
      this._open = null;
      this._naming = null;
      this._render();
    });
    root.querySelector("button.cfclear")?.addEventListener("click", () => {
      if (this._tab === "trips") this._labelFilter = "all";
      this._cf[this._tab] = {};
      this._open = null;
      this._render();
    });
    root.querySelector("button.csv:not(.csvc)")?.addEventListener("click", () => this._exportCsv());
    root.querySelector("button.csvc")?.addEventListener("click", () => this._exportChargesCsv());
    root.querySelectorAll("select.tlabel").forEach((s) => {
      s.addEventListener("click", (ev) => ev.stopPropagation());
      s.addEventListener("change", async () => {
        const id = Number(s.dataset.id);
        let label = s.value;
        if (label === "__other") {
          label = (prompt("Label for this trip (e.g. Client visit):") || "").trim().slice(0, 30);
          if (!label) return this._render();
        }
        try {
          await this._hass.callWS({ type: "mb_logbook/trip_label", trip_id: id, label: label || null });
        } catch (e) {
          alert(`Couldn't save the label: ${e.message || e.code || e}`);
          return this._render();
        }
        if (label && !this._labels.includes(label)) this._labels.push(label);
        // Reload: clearing a trip's own label brings back its place's default.
        const keep = { filter: this._labelFilter };
        await this._load();
        this._labelFilter = keep.filter;
        this._render();
      });
    });
    root.querySelectorAll("button.splittrip").forEach((b) =>
      b.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!confirm("Split this trip in two at its longest stop? Use this when two drives were logged as one.")) return;
        try {
          await this._hass.callWS({ type: "mb_logbook/split_trip", trip_id: Number(b.dataset.id) });
        } catch (e) {
          alert(`Couldn't split the trip: ${e.message || e.code || e}`);
          return;
        }
        await this._load();
      })
    );
    root.querySelectorAll("button.mergetrip").forEach((b) =>
      b.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const id = Number(b.dataset.id);
        const t = this._trips.find((x) => x.id === id);
        const next = t && [...this._trips].filter((x) => x.start_ts > t.start_ts).sort((a, c) => a.start_ts - c.start_ts)[0];
        const what = next ? `the ${this._when(next.start_ts)} trip (${this._dist(next.distance_km)})` : "the next trip";
        if (!confirm(`Join this trip with ${what} into one?`)) return;
        try {
          await this._hass.callWS({ type: "mb_logbook/merge_trips", trip_id: id });
        } catch (e) {
          alert(`Couldn't merge: ${e.message || e.code || e}`);
          return;
        }
        await this._load();
      })
    );
    root.querySelectorAll("button.deltrip").forEach((b) =>
      b.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const t = this._trips.find((x) => x.id === Number(b.dataset.id));
        const what = t ? `${this._when(t.start_ts)}, ${this._dist(t.distance_km)}` : "this trip";
        if (!confirm(`Delete the trip on ${what}? This can't be undone.`)) return;
        try {
          await this._hass.callWS({ type: "mb_logbook/delete_trip", trip_id: Number(b.dataset.id) });
        } catch (e) {
          alert(`Couldn't delete the trip: ${e.message || e.code || e}`);
          return;
        }
        await this._load();
      })
    );
    root.querySelector("details.ignored")?.addEventListener("toggle", (e) => (this._showIgnored = e.target.open));
    root.querySelectorAll("button.ignore").forEach((b) =>
      b.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const u = this._unnamed[Number(b.dataset.id)];
        try {
          await this._hass.callWS({ type: "mb_logbook/place_ignore", lat: u.lat, lon: u.lon });
        } catch (e) {
          alert(`Couldn't ignore the place: ${e.message || e.code || e}`);
          return;
        }
        await this._load();
      })
    );
    root.querySelectorAll("button[data-unignore]").forEach((b) =>
      b.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        try {
          await this._hass.callWS({ type: "mb_logbook/place_unignore", id: Number(b.dataset.unignore) });
        } catch (e) {
          alert(`Couldn't restore the place: ${e.message || e.code || e}`);
          return;
        }
        await this._load();
      })
    );
    root.querySelectorAll("button.nameit:not([data-unignore])").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = Number(b.dataset.id);
        this._naming = { kind: b.dataset.kind, id, end: b.dataset.end };
        if (b.dataset.kind === "trip") this._open = id;
        this._render();
        if (b.dataset.kind === "trip") this._showMap(id);
        else if (b.dataset.kind === "unnamed") this._showNamingMap(this._unnamed[id].lat, this._unnamed[id].lon);
        else {
          const c = this._charges.find((x) => x.id === id);
          this._showNamingMap(c.lat, c.lon);
        }
        root.getElementById("pname")?.focus();
      })
    );
    root.getElementById("pradius")?.addEventListener("change", (e) => this._setEditRadius(Number(e.target.value)));
    const save = root.getElementById("psave");
    if (save) {
      const submit = () => {
        const name = root.getElementById("pname").value.trim();
        if (!name) return root.getElementById("pname").focus();
        // Use the pin/circle as positioned on the map, if it was moved.
        const e = this._edit;
        this._savePlace({
          name,
          lat: e ? e.lat : Number(save.dataset.lat),
          lon: e ? e.lon : Number(save.dataset.lon),
          radius_m: e ? e.radius : Number(root.getElementById("pradius").value),
          // The stop's own recorded point stays linked even if the circle is moved off it.
          anchor_lat: Number(save.dataset.lat),
          anchor_lon: Number(save.dataset.lon),
        });
      };
      save.addEventListener("click", submit);
      root.getElementById("pname").addEventListener("keydown", (e) => e.key === "Enter" && submit());
      root.getElementById("psuggest").addEventListener("click", () => this._suggestNames());
      root.getElementById("pignore").addEventListener("click", async () => {
        try {
          await this._hass.callWS({ type: "mb_logbook/place_ignore", lat: Number(save.dataset.lat), lon: Number(save.dataset.lon) });
        } catch (e) {
          alert(`Couldn't ignore the place: ${e.message || e.code || e}`);
          return;
        }
        await this._load();
      });
      root.getElementById("pcancel").addEventListener("click", () => {
        this._naming = null;
        this._render();
        if (this._open != null) this._showMap(this._open);
      });
    }
    root.querySelectorAll("tr[data-place]").forEach((tr) => {
      const p = this._places.find((x) => x.id === Number(tr.dataset.place));
      tr.querySelector(".pmap").addEventListener("click", () => {
        this._openPlace = this._openPlace === p.id ? null : p.id;
        this._render();
        if (this._openPlace != null) this._showPlaceMap(p);
      });
      tr.querySelector(".pr")?.addEventListener("change", (e) => {
        if (this._openPlace === p.id) this._setEditRadius(Number(e.target.value));
      });
      tr.querySelector(".psv")?.addEventListener("click", () => {
        const name = tr.querySelector(".pn").value.trim();
        if (!name) return;
        const e = this._openPlace === p.id ? this._edit : null; // moved/resized on the map
        this._savePlace({
          place_id: p.id,
          name,
          lat: e ? e.lat : p.lat,
          lon: e ? e.lon : p.lon,
          radius_m: e ? e.radius : Number(tr.querySelector(".pr").value),
        });
      });
      tr.querySelector(".pdel")?.addEventListener("click", async () => {
        if (!confirm(`Delete “${p.name}”? Trips there will show as unnamed again.`)) return;
        await this._hass.callWS({ type: "mb_logbook/place_delete", place_id: p.id });
        await this._load();
      });
    });
  }

  async _ensureMap() {
    if (customElements.get("ha-map")) return true;
    try {
      const helpers = await window.loadCardHelpers();
      helpers.createCardElement({ type: "map", entities: ["zone.home"] });
      await Promise.race([customElements.whenDefined("ha-map"), new Promise((r) => setTimeout(r, 5000))]);
    } catch (e) {
      /* fall through */
    }
    return !!customElements.get("ha-map");
  }

  async _showMap(id) {
    const box = this.shadowRoot.getElementById("mapbox");
    if (!box) return;
    const trip = this._trips.find((t) => t.id === id);
    let points = [];
    try {
      points = await this._hass.callWS({ type: "mb_logbook/trip_points", trip_id: id });
    } catch (e) {
      /* no points */
    }
    points = points.filter((p) => p[1] != null && p[2] != null);
    const paths = [];
    if (points.length >= 2)
      paths.push({
        color: "var(--primary-color)",
        gradualOpacity: 0,
        fullDatetime: false,
        name: `${this._time(trip.start_ts)} → ${this._time(trip.end_ts)}`,
        // HA 2026.x reads `point: [lat, lon]`; latitude/longitude kept for older versions.
        points: points.map((p) => ({ timestamp: new Date(p[0] * 1000), point: [p[1], p[2]], latitude: p[1], longitude: p[2] })),
      });
    // While naming one end, show it as an editable place and zoom to it.
    let edit = false;
    if (this._naming?.kind === "trip" && this._naming.id === id) {
      const lat = this._naming.end === "start" ? trip.start_lat : trip.end_lat;
      const lon = this._naming.end === "start" ? trip.start_lon : trip.end_lon;
      if (lat != null) {
        const r = Number(this.shadowRoot.getElementById("pradius")?.value || 100);
        this._edit = { lat, lon, radius: r, anchors: [[lat, lon]] };
        edit = true;
      }
    }
    if (!paths.length && !edit) {
      box.style.height = "auto"; // no map, so no empty map-sized gap
      box.innerHTML = `<div class="pad dim">No route recorded for this trip.</div>`;
      return;
    }
    await this._drawMap({ paths, edit });
  }
}

MBLogbookCard.css = `
  /* One set of sizes and colours for the whole card. Surfaces and text come from the
   * Home Assistant theme; the eight label colours have a light and a dark step. */
  :host { --mbl-r: 8px; --mbl-r-box: 10px; --mbl-h: 32px; --mbl-line: var(--divider-color);
    --mbl-c0: var(--secondary-text-color); --mbl-c1: #2a78d6; --mbl-c2: #eb6834; --mbl-c3: #1baf7a; --mbl-c4: #eda100;
    --mbl-c5: #e87ba4; --mbl-c6: #008300; --mbl-c7: #6250d6; --mbl-c8: #e34948; }
  :host([dark]) { --mbl-c1: #3987e5; --mbl-c2: #d95926; --mbl-c3: #199e70; --mbl-c4: #c98500; --mbl-c5: #d55181; --mbl-c7: #9085e9; --mbl-c8: #e66767; }
  ha-card { padding: 14px 16px 10px; }
  .pad { padding: 12px; }
  .ic { width: 18px; height: 18px; fill: currentColor; flex: none; vertical-align: -4px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .title { font-size: 1.25em; font-weight: 600; }
  .bar { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
  button, select, input { font: inherit; }
  button { cursor: pointer; }
  :is(button, select, input, th.sort):focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }

  /* Segmented switches */
  .seg { display: inline-flex; border: 1px solid var(--mbl-line); border-radius: var(--mbl-r-box); overflow: hidden; }
  .seg button { background: none; border: 0; color: var(--secondary-text-color); padding: 0 12px; height: calc(var(--mbl-h) - 2px); white-space: nowrap; }
  .seg button:hover { color: var(--primary-text-color); }
  .seg button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .seg.sm button { padding: 0 10px; height: 26px; font-size: .9em; }

  /* Buttons: plain, primary (filled), accent (outline), danger, quiet (text only), dashed */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: var(--mbl-h); padding: 0 12px; box-sizing: border-box;
    border-radius: var(--mbl-r); border: 1px solid var(--mbl-line); background: none; color: var(--primary-text-color); white-space: nowrap; }
  .btn:hover { background: var(--secondary-background-color); }
  .btn .ic { width: 16px; height: 16px; }
  .btn.sm { height: 26px; padding: 0 9px; font-size: .85em; }
  .btn.primary { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); font-weight: 500; }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.accent { border-color: var(--primary-color); color: var(--primary-color); }
  .btn.danger { border-color: color-mix(in srgb, var(--error-color, #db4437) 55%, transparent); color: var(--error-color, #db4437); }
  .btn.danger:hover { background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent); }
  .btn.quiet { border-color: transparent; color: var(--secondary-text-color); }
  .btn.dashed { border-style: dashed; color: var(--secondary-text-color); }
  .btn.dashed:hover { color: var(--primary-color); border-color: var(--primary-color); background: none; }
  .acts { white-space: nowrap; }
  .acts .btn + .btn { margin-left: 6px; }
  button.step { display: inline-grid; place-items: center; width: var(--mbl-h); height: var(--mbl-h); padding: 0; border-radius: 50%; border: 1px solid var(--mbl-line); background: none; color: var(--primary-text-color); }
  button.step:hover:not(:disabled) { background: var(--secondary-background-color); }
  button.step:disabled { opacity: .35; cursor: default; }
  button.suggestion { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--mbl-line); background: var(--secondary-background-color); color: var(--primary-text-color); font-size: .9em; }
  button.suggestion:hover { border-color: var(--primary-color); }
  .suggestions { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px; }

  /* Fields */
  .nameform input, td input.pn, .nameform select, td select.pr { height: var(--mbl-h); box-sizing: border-box; padding: 0 8px; border-radius: var(--mbl-r);
    border: 1px solid var(--mbl-line); background: var(--card-background-color); color: var(--primary-text-color); }
  .nameform input, td input.pn { flex: 1; min-width: 160px; }
  .nameform input[type=checkbox] { flex: none; min-width: 0; width: auto; height: auto; margin: 0; }
  .fpanel { display: flex; flex-wrap: wrap; gap: 10px 14px; padding: 12px; margin: 0 0 12px; border-radius: var(--mbl-r-box); background: var(--secondary-background-color); }
  .fpanel label { display: flex; flex-direction: column; gap: 4px; flex: 1 1 150px; min-width: 0; font-size: .8em; color: var(--secondary-text-color); }
  .fpanel select { height: var(--mbl-h); width: 100%; box-sizing: border-box; padding: 0 8px; border-radius: var(--mbl-r); border: 1px solid var(--mbl-line); background: var(--card-background-color); color: var(--primary-text-color); font-size: 1.1em; }
  .fpanel select.on { border-color: var(--primary-color); }
  .fbtn.open { background: var(--secondary-background-color); }
  .fbtn .count { min-width: 18px; height: 18px; line-height: 18px; border-radius: 999px; background: var(--primary-color); color: var(--text-primary-color, #fff); font-size: .75em; font-weight: 600; text-align: center; }
  button.fchip { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 6px 0 10px; border-radius: 999px; border: 1px solid var(--primary-color); background: color-mix(in srgb, var(--primary-color) 12%, transparent); color: var(--primary-text-color); font-size: .85em; white-space: nowrap; }
  button.fchip .ic { width: 14px; height: 14px; color: var(--secondary-text-color); }
  .tools { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-left: auto; }

  /* Labels: a tinted pill in the label's own colour. The dropdown is the same pill. */
  .lchip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: .85em; white-space: nowrap;
    background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--primary-text-color); }
  .lchip i, .ltotal i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex: none; }
  .lchip.auto { font-style: italic; }
  select.lsel { appearance: none; -webkit-appearance: none; height: 26px; max-width: 12.5em; padding: 0 24px 0 10px; border-radius: 999px; font-size: .85em;
    border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); color: var(--primary-text-color); text-overflow: ellipsis;
    background: color-mix(in srgb, var(--c) 16%, transparent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23888' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E") no-repeat right 4px center / 18px; }
  select.lsel.auto { font-style: italic; background-color: color-mix(in srgb, var(--c) 8%, transparent); border-style: dashed; }
  select.lsel.none { background-color: transparent; border: 1px dashed var(--mbl-line); color: var(--secondary-text-color); }
  select.lsel option { background: var(--card-background-color); color: var(--primary-text-color); font-style: normal; }
  .labelbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 10px; }
  .ltotals { display: inline-flex; flex-wrap: wrap; gap: 4px 14px; font-size: .85em; color: var(--secondary-text-color); }
  .ltotal { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .ltotal b { font-weight: 600; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }

  .periodbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .stepper { display: inline-flex; align-items: center; gap: 4px; }
  .stepper .range { min-width: 9em; text-align: center; font-weight: 500; }

  /* Figures */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 12px; }
  .tile { display: flex; align-items: center; gap: 10px; background: var(--secondary-background-color); border-radius: var(--mbl-r-box); padding: 10px 12px; min-width: 0; }
  .ti { width: 20px; height: 20px; padding: 6px; border-radius: var(--mbl-r); color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .k { font-size: .78em; color: var(--secondary-text-color); white-space: nowrap; }
  .v { font-size: 1.15em; font-weight: 600; margin-top: 1px; font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Tables */
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .9em; }
  th { text-align: left; font-weight: 500; font-size: .92em; color: var(--secondary-text-color); padding: 6px; border-bottom: 1px solid var(--mbl-line); white-space: nowrap; }
  th.sort { cursor: pointer; user-select: none; }
  th.sort:hover, th.sort.on { color: var(--primary-color); }
  th .ic { width: 14px; height: 14px; vertical-align: -2px; margin-left: 2px; }
  td { padding: 7px 6px; border-bottom: 1px solid var(--mbl-line); vertical-align: top; }
  .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr[data-place] td { vertical-align: middle; }
  tr.trip { cursor: pointer; }
  tr.trip:hover, tr.trip.open { background: color-mix(in srgb, var(--secondary-background-color) 60%, transparent); }
  tr.chargeline td { padding: 5px 6px; font-size: .88em; background: color-mix(in srgb, var(--success-color, #43a047) 8%, transparent); }
  tr.chargeline .ic { width: 15px; height: 15px; vertical-align: -3px; margin-right: 6px; color: var(--success-color, #43a047); }
  .tripactions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding-top: 10px; }
  h3.sub { font-size: 1em; font-weight: 600; margin: 20px 0 6px; }
  .ratehist { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .dim { color: var(--secondary-text-color); font-size: .85em; }
  td.dim { font-size: inherit; }
  .empty { text-align: center; color: var(--secondary-text-color); padding: 18px; }
  .badge { display: inline-block; min-width: 1.4em; padding: 0 5px; border-radius: 999px; background: var(--error-color, #db4437); color: #fff; font-size: .72em; font-weight: 600; line-height: 1.5; text-align: center; vertical-align: middle; box-sizing: border-box; }
  .chip { font-size: .75em; padding: 1px 7px; border-radius: 999px; background: var(--secondary-background-color); color: var(--secondary-text-color); }
  .chip.live { background: var(--success-color, #43a047); color: #fff; }
  details.ignored { margin-top: 10px; }
  details.ignored summary { cursor: pointer; color: var(--secondary-text-color); font-size: .9em; }
  .nameform { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0 10px; }
  .offpeak { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .nameform label { display: inline-flex; align-items: center; gap: 4px; }
  .nameform .dim { flex-basis: 100%; }
  #mapbox { height: 320px; border-radius: var(--mbl-r-box); overflow: hidden; }
  #mapbox.small { height: 240px; }
  #mapbox ha-map { height: 100%; display: block; }

  /* The opened trip's figures */
  .tfigs { display: flex; flex-wrap: wrap; gap: 10px 26px; padding: 12px 2px 2px; }
  .tfigs .fv { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* A narrow card (a phone, or a narrow dashboard column): each trip and each charge
   * becomes a stacked block and the column headings go. Sorting moves to the Filter panel. */
  .wrap { container: mbl / inline-size; }
  .c-meta { display: none; }
  @container mbl (max-width: 700px) {
    table.cards, table.cards > tbody { display: block; }
    table.cards > thead { display: none; }
    table.cards tr { display: block; border-bottom: 1px solid var(--mbl-line); }
    table.cards td { display: block; border: 0; padding: 0; text-align: left; }
    table.cards tr.trip, table.cards tr.charge { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "when label" "route dist" "meta meta"; gap: 5px 12px; align-items: center; padding: 11px 4px; }
    table.cards .c-x { display: none; }
    table.cards .c-when { grid-area: when; font-size: .85em; color: var(--secondary-text-color); }
    table.cards .c-when div { display: inline; font-size: inherit; }
    table.cards .c-when div::before { content: " · "; }
    table.cards .c-route { grid-area: route; font-size: 1.05em; font-weight: 500; }
    table.cards .c-label { grid-area: label; justify-self: end; }
    table.cards .c-dist { grid-area: dist; justify-self: end; font-size: 1.25em; font-weight: 600; }
    table.cards .c-meta { display: block; grid-area: meta; font-size: .85em; color: var(--secondary-text-color); }
    table.cards tr.charge .c-label { font-size: .9em; color: var(--secondary-text-color); }
    table.cards tr.charge :is(.c-label, .c-dist) div { display: none; }
    table.cards tr.chargeline td { padding: 7px 8px; }
    table.cards tr.maprow td { padding: 4px 4px 12px; }
    table.cards tr.plain td { padding: 18px; text-align: center; }
    .tripactions { justify-content: flex-start; }
    .stepper .range { min-width: 0; padding: 0 6px; }
  }

  /* Loading placeholders */
  .sk { border-radius: var(--mbl-r); background: linear-gradient(90deg, var(--secondary-background-color) 25%, color-mix(in srgb, var(--secondary-background-color) 55%, transparent) 40%, var(--secondary-background-color) 60%) 0 0 / 300% 100%; animation: mbl-sk 1.4s ease-in-out infinite; }
  .sk-title { width: 180px; height: 24px; margin-bottom: 52px; }
  .sk-tile { height: 56px; border-radius: var(--mbl-r-box); }
  .sk-row { height: 30px; margin-top: 10px; }
  @keyframes mbl-sk { from { background-position: 100% 0; } to { background-position: 0 0; } }
  @media (prefers-reduced-motion: reduce) { .sk { animation: none; } }
`;

const CARD_VERSION = "0.33.0";

if (!customElements.get("mb-logbook-card")) {
  customElements.define("mb-logbook-card", MBLogbookCard);
  console.info(`%c MERCEDES-EV-LOGBOOK-CARD %c ${CARD_VERSION} `, "background:#89b4fa;color:#1e1e2e;font-weight:600", "background:#313244;color:#cdd6f4");
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "mb-logbook-card",
    name: "Mercedes EV Logbook",
    description: "Trips, route maps, parked drain and charging sessions from Mercedes EV Logbook.",
  });
}
