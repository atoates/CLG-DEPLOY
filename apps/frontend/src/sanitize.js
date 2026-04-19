// sanitize.js — shared DOMPurify policy used by the markdown renderers.
//
// Renders HTML that goes into innerHTML elsewhere. The markdown functions
// themselves already escape the raw text and then sprinkle a small
// whitelist of tags in — this is belt-and-braces against anything the
// regex escapers miss (new markdown syntax, future edits, malformed
// model output, pasted HTML).

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a', 'p', 'br', 'hr', 'strong', 'em', 'code', 'pre',
  'ul', 'ol', 'li',
  'h3', 'h4', 'h5', 'h6',
  'span', 'blockquote'
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

export function safeHTML(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
  });
}
