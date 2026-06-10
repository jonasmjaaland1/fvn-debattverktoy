const RSS_URL = 'https://www.fvn.no/rss';
const NEWS_SITEMAP_URL = 'https://www.fvn.no/sitemaps/fvn-news-sitemap.xml';
const MONTH_SITEMAP_URL = 'https://www.fvn.no/sitemaps/fvn-{year}-{month}-sitemap.xml';
const USER_AGENT = 'FVN-Debattverktoy/1.0 (intern redaksjonell bruk)';

function cleanText(value) {
  return decodeHtml(String(value || ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(value) {
  return decodeHtml(value)
    .replace(/<script\b[^>]*>.*?<\/script>/gis, ' ')
    .replace(/<style\b[^>]*>.*?<\/style>/gis, ' ')
    .replace(/<svg\b[^>]*>.*?<\/svg>/gis, ' ')
    .replace(/<noscript\b[^>]*>.*?<\/noscript>/gis, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|li|blockquote|figcaption)>/gi, '\n')
    .replace(/<(p|h1|h2|h3|li|blockquote|figcaption)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? cleanText(match[1]) : '';
}

function tags(block, name) {
  return [...block.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'gi'))]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function articleId(url) {
  return String(url || '').match(/\/i\/([A-Za-z0-9]{4,12})(?:[/?#]|$)/)?.[1] || null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/xml,text/xml,text/html,application/json;q=0.9,*/*;q=0.8',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    const error = new Error(`FVN svarte med HTTP ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }

  return response.text();
}

function parseRss(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    const categories = tags(block, 'category');
    return {
      ingress: tag(block, 'description'),
      publishedAt: parseDate(tag(block, 'pubDate')),
      section: categories[0] || '',
      source: 'rss',
      tags: categories,
      title: tag(block, 'title'),
      url: tag(block, 'link') || tag(block, 'guid'),
    };
  }).filter((item) => item.url);
}

function parseSitemap(xml, source = 'sitemap') {
  return [...xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)].map((match) => {
    const block = match[1];
    const keywords = tag(block, 'news:keywords');
    const tagsList = keywords ? keywords.split(',').map((part) => cleanText(part)).filter(Boolean) : [];
    return {
      ingress: '',
      publishedAt: parseDate(tag(block, 'news:publication_date') || tag(block, 'lastmod')),
      section: tagsList[0] || '',
      source,
      tags: tagsList,
      title: tag(block, 'news:title'),
      url: tag(block, 'loc'),
    };
  }).filter((item) => item.url);
}

function monthUrls(days) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 86400000);
  const urls = [];
  let cursor = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1));

  while (cursor <= now) {
    urls.push(
      MONTH_SITEMAP_URL
        .replace('{year}', String(cursor.getUTCFullYear()))
        .replace('{month}', String(cursor.getUTCMonth() + 1)),
    );
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return urls;
}

async function collectFvnCandidates({ days = 14 } = {}) {
  const cutoff = new Date(Date.now() - days * 86400000);
  const candidates = [];

  const sources = [
    { source: 'rss', url: RSS_URL, parser: parseRss },
    { source: 'news-sitemap', url: NEWS_SITEMAP_URL, parser: (xml) => parseSitemap(xml, 'news-sitemap') },
    ...monthUrls(days).map((url) => ({ source: 'month-sitemap', url, parser: (xml) => parseSitemap(xml, 'month-sitemap') })),
  ];

  for (const source of sources) {
    try {
      const xml = await fetchText(source.url);
      candidates.push(...source.parser(xml));
    } catch (err) {
      console.warn(`FVN-kilde feilet: ${source.url}`, err.message);
    }
  }

  const deduped = new Map();
  for (const candidate of candidates) {
    if (!candidate.url.includes('fvn.no')) continue;
    if (candidate.publishedAt && candidate.publishedAt < cutoff) continue;

    const existing = deduped.get(candidate.url);
    if (!existing) {
      deduped.set(candidate.url, candidate);
      continue;
    }

    for (const key of ['title', 'ingress', 'section']) {
      if (!existing[key] && candidate[key]) existing[key] = candidate[key];
    }
    existing.tags = [...new Set([...(existing.tags || []), ...(candidate.tags || [])])];
    if (!existing.publishedAt && candidate.publishedAt) existing.publishedAt = candidate.publishedAt;
  }

  return [...deduped.values()].sort((a, b) => {
    const aTime = a.publishedAt?.getTime() || 0;
    const bTime = b.publishedAt?.getTime() || 0;
    return bTime - aTime;
  });
}

function meta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta\\b(?=[^>]*(?:property|name)=["']${escaped}["'])(?=[^>]*content=["']([^"']*)["'])[^>]*>`, 'i'),
    new RegExp(`<meta\\b(?=[^>]*content=["']([^"']*)["'])(?=[^>]*(?:property|name)=["']${escaped}["'])[^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return cleanText(match[1]);
  }

  return '';
}

function extractArticle(html, url) {
  const title = cleanText(
    meta(html, 'og:title')
      || meta(html, 'title')
      || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      || '',
  ).replace(/^\(\+\)\s*/, '');
  const ingress = meta(html, 'og:description') || meta(html, 'description');
  const published = parseDate(meta(html, 'article:published_time'));
  const author = meta(html, 'author') || meta(html, 'article:author');
  const section = meta(html, 'article:section');
  const keywords = meta(html, 'keywords');
  const article = html.match(/<article\b[^>]*id=["']main-article["'][^>]*>([\s\S]*?)<\/article>/i)
    || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const bodyText = article ? stripHtml(article[1]) : '';

  return {
    author,
    bodyText,
    fullText: bodyText.length > 500,
    ingress,
    publishedAt: published,
    section,
    source: 'html',
    tags: keywords ? keywords.split(',').map((part) => cleanText(part)).filter(Boolean) : [],
    title,
    url,
  };
}

async function fetchFvnArticle(candidate) {
  try {
    const html = await fetchText(candidate.url);
    const article = extractArticle(html, candidate.url);
    return {
      ...candidate,
      ...article,
      ingress: article.ingress || candidate.ingress,
      publishedAt: article.publishedAt || candidate.publishedAt,
      section: article.section || candidate.section,
      tags: [...new Set([...(candidate.tags || []), ...(article.tags || [])])],
      title: article.title || candidate.title,
    };
  } catch (err) {
    return {
      ...candidate,
      bodyText: '',
      error: err.message,
      fullText: false,
    };
  }
}

function queryMatches(story, query) {
  if (!query) return true;
  const haystack = [
    story.title,
    story.ingress,
    story.section,
    ...(story.tags || []),
    story.bodyText,
    story.url,
  ].join(' ').toLowerCase();
  const terms = String(query).toLowerCase().split(/[, ]+/).filter(Boolean);
  return terms.some((term) => haystack.includes(term));
}

function toSupabaseRow(story) {
  return {
    ingress: story.ingress || null,
    published_at: story.publishedAt ? story.publishedAt.toISOString() : null,
    raw: {
      article_id: articleId(story.url),
      author: story.author || null,
      body_text: story.bodyText || null,
      error: story.error || null,
      full_text: Boolean(story.fullText),
      source: story.source || null,
    },
    section: story.section || null,
    tags: story.tags || [],
    title: story.title || story.url,
    url: story.url,
  };
}

async function fetchFvnStories({ days = 14, limit = 80, query = '', withFullText = true } = {}) {
  const candidates = await collectFvnCandidates({ days });
  const checked = candidates.slice(0, limit);
  const stories = [];

  for (const candidate of checked) {
    const story = withFullText ? await fetchFvnArticle(candidate) : candidate;
    if (queryMatches(story, query)) stories.push(story);
  }

  return {
    candidates: candidates.length,
    checked: checked.length,
    rows: stories.map(toSupabaseRow),
    stories,
  };
}

export { fetchFvnStories };
