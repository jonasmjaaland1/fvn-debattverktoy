const EMAIL_HEADER_RE = /^\*?(fra|from|sendt|sent|til|to|kopi|cc|emne|subject|dato|date)\*?:\s+/i;
const REPLY_BOUNDARY_RE = /^(-{2,}\s*)?(opprinnelig melding|original message|forwarded message|videresendt melding)(\s*-{2,})?$/i;
const WROTE_RE = /(^((den|on)\s+.+\s+)?(skrev|wrote):\s*$)|(.+\s+(skrev|wrote|yazd[ıi]|şunu yazd[ıi]):\s*$)/i;

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function countWords(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function isDivider(line) {
  return /^[_-]{6,}\s*$/.test(stripQuotePrefix(line).trim());
}

function stripQuotePrefix(line) {
  return String(line || '').replace(/^\s*(>\s*)+/, '');
}

function normalizeHeaderLine(line) {
  return stripQuotePrefix(line)
    .trim()
    .replace(/^\*([^*]+)\*:\s*/, '$1: ')
    .replace(/^\*([^*]+):\*\s*/, '$1: ');
}

function isHeaderLine(line) {
  return EMAIL_HEADER_RE.test(normalizeHeaderLine(line));
}

function parseHeaderLine(line) {
  const match = normalizeHeaderLine(line).match(EMAIL_HEADER_RE);
  if (!match) return null;

  const label = match[1].toLowerCase();
  const value = normalizeHeaderLine(line).replace(EMAIL_HEADER_RE, '').trim();
  return { label, value };
}

function isReplyBoundary(line) {
  const trimmed = stripQuotePrefix(line).trim();
  return isDivider(trimmed) || REPLY_BOUNDARY_RE.test(trimmed) || WROTE_RE.test(trimmed);
}

function looksLikeEditorHeader(line) {
  const trimmed = line.toLowerCase();
  return (
    isHeaderLine(line)
    && (
      trimmed.includes('@fvn.no')
      || trimmed.includes('fædrelandsvennen')
      || trimmed.includes('fvn debatt')
      || trimmed.includes('fvn folk')
    )
  );
}

function stripHeaderBlock(lines, startIndex) {
  let index = startIndex;

  while (index < lines.length && (isHeaderLine(lines[index]) || !stripQuotePrefix(lines[index]).trim() || isDivider(lines[index]))) {
    index += 1;
  }

  return index;
}

function removeHeaderBlocks(lines) {
  const cleaned = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripQuotePrefix(lines[index]);

    if (isHeaderLine(line)) {
      index = stripHeaderBlock(lines, index) - 1;
      continue;
    }

    if (/^\[cid:.*\]$/i.test(line.trim())) continue;
    if (/^\[image:.*\]$/i.test(line.trim())) continue;
    if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(line.trim())) continue;

    cleaned.push(line);
  }
  return cleaned;
}

function parseHeaderBlock(lines, startIndex) {
  let index = startIndex;
  const headers = {};
  let seenHeaders = 0;

  while (index < lines.length && (isDivider(lines[index]) || !stripQuotePrefix(lines[index]).trim())) {
    index += 1;
  }

  while (index < lines.length) {
    const line = lines[index];
    const header = parseHeaderLine(line);
    if (!header) break;

    headers[header.label] = header.value;
    seenHeaders += 1;
    index += 1;

    while (index < lines.length && !stripQuotePrefix(lines[index]).trim()) {
      index += 1;
    }
  }

  if (seenHeaders < 2) return null;
  return { endIndex: index, headers };
}

function headerValue(headers, ...labels) {
  for (const label of labels) {
    if (headers[label]) return headers[label];
  }
  return '';
}

function removeTrailingQuoteNoise(value) {
  return normalizeText(value)
    .split('\n')
    .filter((line) => !/^\s*>?\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function originalSubmissionCandidates(value) {
  const lines = normalizeText(value).split('\n');
  const candidates = [];

  for (let index = 0; index < lines.length; index += 1) {
    const block = parseHeaderBlock(lines, index);
    if (!block) continue;

    const from = headerValue(block.headers, 'fra', 'from').toLowerCase();
    const to = headerValue(block.headers, 'til', 'to').toLowerCase();
    const subject = headerValue(block.headers, 'emne', 'subject');
    const looksLikeInbound = to.includes('fvn') || to.includes('debatt@') || subject;
    const looksLikeEditor = from.includes('@fvn.no') || from.includes('fvn debatt') || from.includes('fvn folk');

    if (looksLikeInbound && !looksLikeEditor) {
      const body = removeTrailingQuoteNoise(removeHeaderBlocks(lines.slice(block.endIndex)).join('\n'));
      const words = countWords(body);
      if (words >= 40) {
        candidates.push({ body, words });
      }
    }

    index = block.endIndex;
  }

  return candidates.sort((a, b) => b.words - a.words).map((candidate) => candidate.body);
}

function stripQuotedReply(value) {
  const text = normalizeText(value);
  if (!text) return '';

  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const before = lines.slice(0, index).join('\n').trim();
    const beforeCleaned = removeHeaderBlocks(before.split('\n')).join('\n').trim();
    const hasEnoughOwnText = beforeCleaned.length >= 120 || countWords(beforeCleaned) >= 20;

    if (looksLikeEditorHeader(line) && beforeCleaned.length >= 40) {
      return beforeCleaned;
    }

    if (isReplyBoundary(line) && hasEnoughOwnText) {
      return beforeCleaned;
    }
  }

  return text;
}

function cleanSubmittedText(value) {
  const originalCandidates = originalSubmissionCandidates(value);
  const withoutQuotedReply = stripQuotedReply(value);
  const lines = withoutQuotedReply.split('\n');
  const cleaned = removeTrailingQuoteNoise(removeHeaderBlocks(lines).join('\n'));

  if (originalCandidates.length && countWords(cleaned) < 40) {
    return originalCandidates[0];
  }

  if (originalCandidates.length && hasEmailThreadArtifacts(cleaned) && countWords(originalCandidates[0]) > countWords(cleaned)) {
    return originalCandidates[0];
  }

  return cleaned || originalCandidates[0] || '';
}

function hasEmailThreadArtifacts(value) {
  const text = normalizeText(value);
  if (!text) return false;

  const lines = text.split('\n');
  const headerLines = lines.filter(isHeaderLine).length;
  return headerLines >= 3 || lines.some(isReplyBoundary) || lines.some((line) => /^\s*>/.test(line));
}

export {
  cleanSubmittedText,
  countWords,
  hasEmailThreadArtifacts,
  normalizeText,
};
