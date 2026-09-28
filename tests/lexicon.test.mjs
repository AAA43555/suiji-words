import assert from "node:assert/strict";
import { correctWord, parseOcrText } from "../recognition.mjs";

const words = new Set(["apple", "vivid", "serendipity", "progress"]);
assert.equal(correctWord("appl", words), "apple");
assert.equal(correctWord("vivid", words), "vivid");
assert.equal(parseOcrText("vivid", words)[0].word, "vivid");
assert.equal(parseOcrText("serendip1ty", words)[0].word, "serendipity");
console.log("lexicon correction tests passed");
