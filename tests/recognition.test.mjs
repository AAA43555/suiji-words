import assert from "node:assert/strict";
import { parseOcrText, entryType, validEntry } from "../recognition.mjs";

assert.deepEqual(parseOcrText("apple 苹果\nI love this city. 我爱这座城市"), [
  { word: "apple", meaning: "苹果" },
  { word: "I love this city.", meaning: "我爱这座城市" }
]);
assert.deepEqual(parseOcrText("1. look forward to - 期待\n2) Time flies when you're having fun."), [
  { word: "look forward to", meaning: "期待" },
  { word: "Time flies when you're having fun.", meaning: "" }
]);
assert.equal(entryType("apple"), "单词");
assert.equal(entryType("look forward to"), "短语");
assert.equal(entryType("Time flies when you're having fun."), "例句");
assert.equal(validEntry("A little progress every day."), true);
assert.equal(validEntry("只有中文"), false);
console.log("recognition tests passed");
