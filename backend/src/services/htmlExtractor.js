import * as cheerio from 'cheerio';

const NOISE_SELECTORS = 'script, style, noscript, template, svg, iframe, nav, footer, header, aside, form, button';
const BLOCK_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, tr, section, article, div, br';

/**
 * Pull readable text and a title out of an HTML document.
 * Heuristic (not a full readability port): drop page chrome, prefer <article>/<main>,
 * and keep paragraph breaks so the chunker can respect them.
 */
export function extractReadableText(html) {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    null;

  $(NOISE_SELECTORS).remove();

  const root = ['article', 'main', '[role="main"]', 'body']
    .map((selector) => $(selector).first())
    .find((el) => el.length && el.text().trim().length > 200) ?? $('body').first();

  root.find(BLOCK_SELECTORS).each((_, el) => {
    $(el).append('\n\n');
  });

  const text = root
    .text()
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text };
}
