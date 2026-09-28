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

export function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

export function correctWord(word, lexicon) {
  const value = word.toLowerCase();
  if (!lexicon || !value || !/^[a-z]+$/.test(value)) return word;
  if (lexicon.has(value)) return word;
  let best = word;
  let bestDistance = 3;
  for (const candidate of lexicon) {
    if (Math.abs(candidate.length - value.length) > 2) continue;
    const distance = levenshtein(value, candidate);
    if (distance < bestDistance || (distance === bestDistance && candidate.length === value.length)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= 2 ? best : word;
}

export function parseOcrText(text, lexicon = null) {
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
    if (/^[A-Za-z0-9]+$/.test(front)) {
      const normalized = front.toLowerCase().replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/5/g, "s").replace(/7/g, "t");
      front = correctWord(normalized, lexicon);
    }
    if (!validEntry(front) || /^(page|date|unit|word|meaning)$/i.test(front)) continue;
    result.push({ word: front, meaning: meaning.slice(0, 500) });
  }
  return result.slice(0, 40);
}
