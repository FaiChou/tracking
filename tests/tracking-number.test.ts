import assert from "node:assert/strict";
import test from "node:test";
import {
  build17TrackUrl, buildTrackingUrl, normalizeTrackingNumber, parseTrackingInput,
} from "../lib/tracking-number";

test("tracking numbers lose pasted whitespace, controls and invisible Unicode characters", () => {
  const artifacts = [
    " ", "\t", "\r", "\n", "\u00a0", "\u202f", "\u3000", "\u0000", "\u007f", "\u0085",
    "\u200b", "\u200c", "\u200d", "\ufeff", "\u2060", "\u00ad", "\u200e", "\u202e", "\u2066",
    "\u034f", "\ufe0f", "\u{e0100}",
  ];
  for (const artifact of artifacts) {
    assert.equal(normalizeTrackingNumber(`${artifact}1Z${artifact}00123${artifact}`), "1Z00123");
  }
  assert.equal(normalizeTrackingNumber(artifacts.join("")), "");
});

test("normalization preserves leading zeros, case and visible punctuation without decoding URLs", () => {
  const number = "00Ab-c_d/12+3&4#5%20";
  assert.equal(normalizeTrackingNumber(number), number);
  assert.equal(normalizeTrackingNumber(normalizeTrackingNumber("\u200b00Ab\ufeff")), "00Ab");
});

test("pasted lines clean only numbers, retain notes and ignore invisible-only lines", () => {
  assert.deepEqual(parseTrackingInput(
    "\u200b \ufeff1Z\u200c00123 商品 A\u200b 保留\r\n\u206012\u00a034\ufeff\n\u200b\ufeff \n\nAB-12  第二条备注",
  ), [
    { trackingNumber: "1Z00123", note: "商品 A\u200b 保留" },
    { trackingNumber: "1234", note: null },
    { trackingNumber: "AB-12", note: "第二条备注" },
  ]);
  assert.deepEqual(parseTrackingInput("\u200b\ufeff \n\u2060"), []);
});

test("carrier links clean legacy numbers and encode only the appended number", () => {
  const base = "https://carrier.example/track?language=zh&number=";
  const url = buildTrackingUrl(base, "\u200b00Ab\u00a0-12\ufeff");
  assert.equal(url, `${base}00Ab-12`);
  assert.equal(new URL(buildTrackingUrl(base, "AB&other=1#2")!).searchParams.get("number"), "AB&other=1#2");
  assert.equal(buildTrackingUrl(base, "\u200b\ufeff \t"), null);
});

test("17track links clean each number, keep selection order and skip empty numbers", () => {
  const numbers = ["\u200bAB001", "\ufeff \u2060", "CD\u00a0002\u200e", "EF,003"];
  assert.equal(build17TrackUrl(numbers), "https://t.17track.net/zh-cn#nums=AB001,CD002,EF%2C003");
  assert.equal(numbers[0], "\u200bAB001");
  assert.equal(build17TrackUrl(["\u200b", " \ufeff"]), null);
  assert.equal(build17TrackUrl([]), null);
});
