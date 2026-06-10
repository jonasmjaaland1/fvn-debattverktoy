const EMAIL_HEADER_RE = /^(fra|from|sendt|sent|til|to|kopi|cc|emne|subject|dato|date):\s+/i;
const REPLY_BOUNDARY_RE = /^(-{2,}\s*)?(opprinnelig melding|original message|forwarded message|videresendt melding)(\s*-{2,})?$/i;
const WROTE_RE = /^(den|on)\s+.+(skrev|wrote):\s*$/i;

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
  return /^[_-]{6,}\s*$/.test(line.trim());
}

function isHeaderLine(line) {
  return EMAIL_HEADER_RE.test(line.trim());
}

function isReplyBoundary(line) {
  const trimmed = line.trim();
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

  while (index < lines.length && (isHeaderLine(lines[index]) || !lines[index].trim())) {
    index += 1;
  }

  return index;
}

function removeHeaderBlocks(lines) {
  const cleaned = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

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
  const withoutQuotedReply = stripQuotedReply(value);
  const lines = withoutQuotedReply.split('\n');
  const cleaned = removeHeaderBlocks(lines)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

function hasEmailThreadArtifacts(value) {
  const text = normalizeText(value);
  if (!text) return false;

  const lines = text.split('\n');
  const headerLines = lines.filter(isHeaderLine).length;
  return headerLines >= 3 || lines.some(isReplyBoundary);
}

export {
  cleanSubmittedText,
  countWords,
  hasEmailThreadArtifacts,
  normalizeText,
};
