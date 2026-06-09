const LOCAL_TERMS = [
  'agder',
  'arendal',
  'birkenes',
  'evje',
  'farsund',
  'flekkefjord',
  'fvn',
  'fædrelandsvennen',
  'grimstad',
  'kristiansand',
  'kvinesdal',
  'lillesand',
  'lindesnes',
  'lyngdal',
  'mandal',
  'søgne',
  'sørlandet',
  'vennesla',
];

const RISK_PATTERNS = [
  { flag: 'mulig personangrep', pattern: /\b(idiot|korrupt|svindler|løgner|rasist)\b/i },
  { flag: 'sterk udokumentert beskyldning', pattern: /\b(kriminell|bedrageri|underslag|bestikkelser?)\b/i },
  { flag: 'mulig diskriminerende formulering', pattern: /\b(jævla|forbanna)\s+(innvandrere|muslimer|jøder|homofile|kvinner|menn)\b/i },
  { flag: 'svært langt innlegg', pattern: null },
];

function textOf(item) {
  return [item.subject, item.body_text, item.body_preview].filter(Boolean).join('\n\n').toLowerCase();
}

function wordCount(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function clampScore(value) {
  return Math.max(0, Math.min(3, value));
}

function scoreAktualitet(item) {
  if (!item.received_at) return 1;

  const received = new Date(item.received_at).getTime();
  const ageDays = (Date.now() - received) / 86400000;
  if (ageDays <= 2) return 3;
  if (ageDays <= 7) return 2;
  if (ageDays <= 30) return 1;
  return 0;
}

function scoreLocal(text) {
  const hits = LOCAL_TERMS.filter((term) => text.includes(term));
  if (hits.length >= 2) return { score: 3, hits };
  if (hits.length === 1) return { score: 2, hits };
  return { score: 1, hits };
}

function scoreLanguage(item) {
  const words = wordCount(item.body_text || item.body_preview);
  if (words < 80) return 1;
  if (words > 900) return 1;

  const paragraphs = String(item.body_text || '').split(/\n\s*\n/).filter(Boolean).length;
  if (paragraphs >= 2 && words <= 650) return 3;
  return 2;
}

function detectRisks(item) {
  const body = textOf(item);
  const flags = RISK_PATTERNS.filter(({ pattern }) => pattern && pattern.test(body)).map(({ flag }) => flag);

  if (wordCount(item.body_text || item.body_preview) > 900) {
    flags.push('svært langt innlegg');
  }

  if (!item.sender_email) {
    flags.push('mangler tydelig avsender-e-post');
  }

  if (item.has_attachments) {
    flags.push('vedlegg må vurderes manuelt');
  }

  return [...new Set(flags)];
}

function storyMatches(item, stories = []) {
  const text = textOf(item);

  return stories
    .map((story) => {
      const titleWords = String(story.title || '')
        .toLowerCase()
        .split(/[^a-zæøå0-9]+/i)
        .filter((word) => word.length >= 5);
      const hits = titleWords.filter((word) => text.includes(word));
      return { story, hits };
    })
    .filter((match) => match.hits.length >= 2)
    .slice(0, 3);
}

function recommendation(total, riskFlags) {
  if (riskFlags.length) return 'manual_review';
  if (total >= 18) return 'candidate';
  if (total >= 13) return 'needs_edit';
  if (total >= 9) return 'hold';
  return 'rejected';
}

function titleSuggestion(item) {
  const subject = String(item.subject || '').replace(/^(sv|re|fw|fwd):\s*/i, '').trim();
  if (subject && subject.length <= 90) return subject;
  if (subject) return `${subject.slice(0, 87).trim()}...`;
  return 'Leserinnlegg uten tittel';
}

function evaluateDebateItem(item, stories = []) {
  const text = textOf(item);
  const local = scoreLocal(text);
  const matches = storyMatches(item, stories);
  const riskFlags = detectRisks(item);
  const language = scoreLanguage(item);

  const scores = {
    aktualitet: scoreAktualitet(item),
    relevans: clampScore(wordCount(item.body_text || item.body_preview) >= 120 ? 2 : 1),
    lokal_regional: local.score,
    mix: 2,
    flere_sider: 2,
    sprak_personlig: language,
    fvn_kobling: matches.length ? 3 : 1,
  };

  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const suggestedStatus = recommendation(total, riskFlags);

  return {
    editor_note: [
      `Foreløpig vurdering: ${total}/21 poeng.`,
      local.hits.length
        ? `Lokal/regional kobling: ${local.hits.slice(0, 4).join(', ')}.`
        : 'Lokal/regional kobling er foreløpig svak og bør vurderes av redaktør.',
      matches.length
        ? `Mulig kobling til nylig FVN-stoff: ${matches.map((match) => match.story.title).join(' / ')}.`
        : 'Ingen tydelig maskinell kobling til registrerte FVN-saker ennå.',
    ].join(' '),
    fvn_connection: matches.length ? matches.map((match) => match.story.title).join(' / ') : null,
    local_connection: local.hits.length ? local.hits.join(', ') : null,
    priority: total,
    risk_flags: riskFlags,
    scores,
    status: suggestedStatus,
    suggested_title: titleSuggestion(item),
    topic: null,
  };
}

export { evaluateDebateItem };
