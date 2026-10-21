import { z } from 'zod';

export const MAX_NOTE_CHARS = 50_000;
export const MAX_QUESTION_CHARS = 1_000;

const optionalTitle = z
  .string()
  .trim()
  .max(200, 'title must be at most 200 characters')
  .optional()
  .transform((value) => value || undefined);

const looksLikeUrl = (value) => /(?:https?:\/\/|www\.)\S+/i.test(value);
const isReadableNote = (value) => {
  const letters = (value.match(/[a-z]/gi) ?? []).length;
  const words = value.match(/[a-z]{2,}/gi) ?? [];
  const hasVowel = /[aeiou]/i.test(value);
  const hasLongConsonantRun = /[bcdfghjklmnpqrstvwxyz]{6,}/i.test(value);
  return letters >= 3 && words.length >= 2 && hasVowel && !hasLongConsonantRun;
};

/** POST /ingest — a note carries `content`, a url carries `url`. */
export const ingestBody = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('note'),
      content: z
        .string('content must be a string')
        .trim()
        .min(1, 'content must not be empty')
        .max(MAX_NOTE_CHARS, `content must be at most ${MAX_NOTE_CHARS} characters`)
        .refine((value) => !looksLikeUrl(value), 'This looks like a URL. Please enter it in the URL tab.')
        .refine((value) => isReadableNote(value), 'Note content appears unreadable. Please enter meaningful text.'),
      title: optionalTitle,
    }),
    z.object({
      type: z.literal('url'),
      url: z
        .string('url must be a string')
        .trim()
        .max(2048, 'url must be at most 2048 characters')
        .refine((value) => URL.canParse(value) && /^https?:$/.test(new URL(value).protocol), {
          message: 'url must be a valid http:// or https:// URL',
        }),
      title: optionalTitle,
    }),
  ],
  { error: 'type must be "note" or "url"' },
);

/** POST /query */
export const queryBody = z.object({
  question: z
    .string('question must be a string')
    .trim()
    .min(3, 'question must be at least 3 characters')
    .max(MAX_QUESTION_CHARS, `question must be at most ${MAX_QUESTION_CHARS} characters`),
  topK: z.number('topK must be a number').int().min(1).max(10).optional(),
});

/** GET /items */
export const listItemsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParams = z.object({ id: z.uuid('id must be a UUID') });
