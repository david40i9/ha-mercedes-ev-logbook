// Behaviour tests for the dashboard card, run with `node --test tests/js/`.
// The card is plain JavaScript for the browser, so it is loaded here with just
// enough of a fake page around it; nothing is drawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const CARD = new URL("../../custom_components/mb_logbook/frontend/mb-logbook-card.js", import.meta.url);

function loadCard() {
  const saved = [];
  const fakeRoot = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null, getElementById: () => null };
  const ctx = {
    console: { ...console, info: () => {} },
    setTimeout,
    Promise,
    Date,
    Intl,
    Map,
    Set,
    Blob,
    URL: { createObjectURL: (blob) => (saved.push(blob), "blob:x"), revokeObjectURL: () => {} },
    HTMLElement: class {
      attachShadow() {
        this.shadowRoot = fakeRoot;
      }
    },
    customElements: { define() {}, get() {} },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } },
  };
  ctx.window = ctx;
  ctx.window.customCards = [];
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CARD, "utf8") + "\nthis.Card = MBLogbookCard;", ctx);
  const card = new ctx.Card();
  card.setConfig({});
  card._render = () => {};
  card._showMap = () => {};
  card._toast = () => {};
  return { card, saved };
}

const trip = (id, label, km, day) => ({
  id, label, distance_km: km, start_ts: Date.UTC(2026, 10, day, 9) / 1000, end_ts: Date.UTC(2026, 10, day, 10) / 1000,
  start_place: "Home", end_place: label === "=Business" ? "=HYPERLINK()" : "Office",
  odo_start_km: 1000, odo_end_km: 1000 + km, soc_start: 80, soc_end: 70,
});

test("a slower earlier load never replaces the period picked after it", async () => {
  const { card } = loadCard();
  card._car = { entry_id: "e1", name: "Car", unit: "km" };
  const wait = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));
  let period = "year";
  card._hass = {
    callWS: (m) => {
      if (m.type === "mb_logbook/trips") return period === "year" ? wait(60, [trip(1, "Business", 5, 1)]) : wait(5, [trip(2, "Business", 7, 2)]);
      return wait(1, m.type === "mb_logbook/rates" ? { locations: [], rates: [] } : []);
    },
  };
  card._period = "year";
  const first = card._load();
  period = card._period = "week";
  const second = card._load();
  await Promise.all([first, second]);
  assert.deepEqual(card._trips.map((t) => t.id), [2]);
});

test("the trips CSV has only the filtered trips, oldest first, in miles, formulas defused", async () => {
  const { card, saved } = loadCard();
  card._hass = { locale: { language: "en-GB" } };
  card._car = { entry_id: "e1", name: "Car", unit: "mi" };
  card._trips = [trip(1, "Business", 16.09344, 3), trip(2, "Personal", 50, 2), trip(3, "Business", 8.04672, 1)];
  card._labelFilter = "Business";
  card._exportCsv();
  const text = (await saved[0].text()).replace(/^﻿/, "");
  const lines = text.split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /"Distance \(mi\)"/);
  const cells = lines.slice(1).map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "")));
  assert.deepEqual(cells.map((c) => c[5]), ["5.0", "10.0"]);
  assert.deepEqual(cells.map((c) => c[8]), ["Business", "Business"]);

  card._trips = [trip(4, "=Business", 10, 4)];
  card._labelFilter = "all";
  card._exportCsv();
  const row = (await saved[1].text()).split("\r\n")[1];
  assert.match(row, /"'=HYPERLINK\(\)"/);
  assert.match(row, /"'=Business"/);
});
