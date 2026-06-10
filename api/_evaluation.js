import { cleanSubmittedText, countWords, hasEmailThreadArtifacts } from './_text.js';

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

const PUBLIC_INTEREST_TERMS = [
  'budsjett',
  'demokrati',
  'helse',
  'klima',
  'kommune',
  'kommunen',
  'kultur',
  'miljø',
  'næring',
  'offentlig',
  'politikk',
  'samfunn',
  'skole',
  'sykehus',
  'trafikk',
  'utbygging',
  'velferd',
];

const NUANCE_TERMS = [
  'likevel',
  'men',
  'på den andre siden',
  'samtidig',
  'selv om',
  'derimot',
  'like fullt',
  'for det første',
  'for det andre',
];

const RISK_PATTERNS = [
  { flag: 'mulig personangrep', pattern: /\b(idiot|korrupt|svindler|løgner|rasist)\b/i },
  { flag: 'sterk udokumentert beskyldning', pattern: /\b(kriminell|bedrageri|underslag|bestikkelser?)\b/i },
  { flag: 'mulig diskriminerende formulering', pattern: /\b(jævla|forbanna)\s+(innvandrere|muslimer|jøder|homofile|kvinner|menn)\b/i },
  { flag: 'mulig reklame/egenpromotering', pattern: /\b(kjøp|bestill|kampanje|rabatt|sponset|vårt produkt|vår tjeneste)\b/i },
  { flag: 'mulig masseutsendt innlegg', pattern: /\b(sendt til flere aviser|sendt til flere redaksjoner|til flere medier)\b/i },
  { flag: 'svært langt innlegg', pattern: null },
];

function textOf(item) {
  return [item.subject, cleanSubmittedText(item.body_text), cleanSubmittedText(item.body_preview)]
    .filter(Boolean)
    .join('\n\n')
    .toLowerCase();
}

function clampScore(value) {
  return Math.max(0, Math.min(3, value));
}

function scoreAktualitet(item) {
  if (!item.received_at) return 1;

  const received = new Date(item.received_at).getTime();
  const ageDays = (Date.now() - received) / 86400000;
  if (ageDays <= 2) return 3;
  if (ageDays <= 5) return 2;
  if (ageDays <= 14) return 1;
  return 0;
}

function scoreLocal(text) {
  const hits = LOCAL_TERMS.filter((term) => text.includes(term));
  if (hits.length >= 2) return { score: 3, hits };
  if (hits.length === 1) return { score: 2, hits };
  return { score: 1, hits };
}

function scoreRelevance(text, words) {
  const publicHits = PUBLIC_INTEREST_TERMS.filter((term) => text.includes(term));
  if (words < 120) return { score: 1, hits: publicHits };
  if (publicHits.length >= 2) return { score: 3, hits: publicHits };
  if (publicHits.length === 1) return { score: 2, hits: publicHits };
  return { score: 1, hits: publicHits };
}

function scoreLanguage(item) {
  const body = cleanSubmittedText(item.body_text || item.body_preview);
  const words = countWords(body);
  if (words < 120) return 0;
  if (words > 900) return 0;
  if (words > 750) return 1;

  const paragraphs = body.split(/\n\s*\n/).filter(Boolean).length;
  if (paragraphs >= 3 && words <= 650 && !hasEmailThreadArtifacts(body)) return 3;
  return 2;
}

function scoreMultipleSides(text) {
  const nuanceHits = NUANCE_TERMS.filter((term) => text.includes(term));
  if (nuanceHits.length >= 2) return { score: 3, hits: nuanceHits };
  if (nuanceHits.length === 1) return { score: 2, hits: nuanceHits };
  return { score: 1, hits: nuanceHits };
}

function scoreMix(item, text, words) {
  const sender = String(item.sender_name || item.sender_email || '').toLowerCase();
  const personalMarkers = /\b(jeg|vi|min|mitt|vår|vårt|opplevde|erfaring|som innbygger|som forelder)\b/i.test(text);
  const institutionalSender = /\b(parti|kommune|forening|organisasjon|selskap|as|gruppen|lista)\b/i.test(sender);

  if (words < 120 || words > 900) return 1;
  if (personalMarkers && !institutionalSender) return 3;
  if (personalMarkers || !institutionalSender) return 2;
  return 1;
}

function detectRisks(item) {
  const body = textOf(item);
  const cleanedBody = cleanSubmittedText(item.body_text || item.body_preview);
  const words = countWords(cleanedBody);
  const flags = RISK_PATTERNS.filter(({ pattern }) => pattern && pattern.test(body)).map(({ flag }) => flag);

  if (words < 120) {
    flags.push('for kort/ufullstendig innlegg');
  }

  if (words > 900) {
    flags.push('svært langt innlegg');
  }

  if (hasEmailThreadArtifacts(item.body_text || item.body_preview)) {
    flags.push('inneholder e-posttråd eller sitert svar');
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
      const storyText = [
        story.title,
        story.ingress,
        story.section,
        ...(story.tags || []),
        story.raw?.body_text,
      ].filter(Boolean).join(' ');
      const titleWords = String(storyText || '')
        .toLowerCase()
        .split(/[^a-zæøå0-9]+/i)
        .filter((word) => word.length >= 5 && !['dette', 'eller', 'etter', 'ingen', 'siste', 'viser'].includes(word));
      const hits = [...new Set(titleWords.filter((word) => text.includes(word)))];
      return { story, hits };
    })
    .filter((match) => match.hits.length >= 2)
    .slice(0, 3);
}

function recommendation(total, scores, riskFlags) {
  const blockingRisks = riskFlags.filter((flag) => !['inneholder e-posttråd eller sitert svar'].includes(flag));
  if (blockingRisks.length) return 'manual_review';
  if (scores.lokal_regional < 2 || scores.relevans < 2 || scores.sprak_personlig < 2) return 'hold';
  if (total >= 19 && scores.fvn_kobling >= 2 && scores.flere_sider >= 2) return 'candidate';
  if (total >= 15) return 'needs_edit';
  if (total >= 11) return 'hold';
  return 'rejected';
}

function titleSuggestion(item) {
  const subject = String(item.subject || '').replace(/^(sv|re|fw|fwd):\s*/i, '').trim();
  if (subject && subject.length <= 90) return subject;
  if (subject) return `${subject.slice(0, 87).trim()}...`;
  return 'Leserinnlegg uten tittel';
}

function evaluateDebateItem(item, stories = []) {
  const cleanBody = cleanSubmittedText(item.body_text || item.body_preview);
  const evaluatedItem = {
    ...item,
    body_preview: cleanBody.slice(0, 500),
    body_text: cleanBody,
  };
  const text = textOf(item);
  const local = scoreLocal(text);
  const matches = storyMatches(item, stories);
  const riskFlags = detectRisks(item);
  const language = scoreLanguage(evaluatedItem);
  const words = countWords(cleanBody);
  const relevance = scoreRelevance(text, words);
  const multipleSides = scoreMultipleSides(text);

  const scores = {
    aktualitet: scoreAktualitet(item),
    relevans: relevance.score,
    lokal_regional: local.score,
    mix: scoreMix(item, text, words),
    flere_sider: multipleSides.score,
    sprak_personlig: language,
    fvn_kobling: matches.length ? 3 : local.score >= 2 ? 2 : 0,
  };

  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const suggestedStatus = recommendation(total, scores, riskFlags);

  return {
    body_preview: cleanBody.slice(0, 500),
    body_text: cleanBody,
    editor_note: [
      `Streng vurdering: ${total}/21 poeng.`,
      local.hits.length
        ? `Lokal/regional kobling: ${local.hits.slice(0, 4).join(', ')}.`
        : 'Lokal/regional kobling er svak.',
      relevance.hits.length
        ? `Offentlig relevans: ${relevance.hits.slice(0, 4).join(', ')}.`
        : 'Offentlig relevans er ikke tydelig nok maskinelt.',
      multipleSides.hits.length
        ? `Nyanse/avveining: ${multipleSides.hits.slice(0, 3).join(', ')}.`
        : 'Få tegn til at flere sider av saken drøftes.',
      matches.length
        ? `Mulig kobling til nylig FVN-stoff: ${matches.map((match) => `${match.story.title} (${match.hits.slice(0, 3).join(', ')})`).join(' / ')}.`
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
