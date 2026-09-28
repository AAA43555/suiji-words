export function validEntry(text) {
  const value = text.trim();
  return value.length >= 2 && value.length <= 300 && /[A-Za-z]/.test(value) &&
    /^[A-Za-z0-9\s.,!?;:'"()\-–—]+$/.test(value);
}

export function entryType(text) {
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  if (count >= 4 || /[.!?]$/.test(text.trim())) return "例句";
  if (count >= 2) return "短语";
  return "单词";
}

export function parseOcrText(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/[|•·]/g, " ").replace(/^\s*\d+[.)、]\s*/, "").trim()).filter(Boolean);
  const result = [];
  for (const line of lines) {
    let splitAt = line.search(/[\u3400-\u9fff]/);
    let front = line;
    let meaning = "";
    if (splitAt > 0) {
      front = line.slice(0, splitAt).trim();
      meaning = line.slice(splitAt).trim();
    } else {
      const separator = /\s[-—–]\s/.exec(line);
      if (separator) {
        front = line.slice(0, separator.index).trim();
        meaning = line.slice(separator.index + separator[0].length).trim();
      }
    }
    front = front.replace(/[-—–:：\s]+$/, "").trim();
    if (!validEntry(front) || /^(page|date|unit|word|meaning)$/i.test(front)) continue;
    result.push({ word: front, meaning: meaning.slice(0, 500) });
  }
  return result.slice(0, 40);
}
