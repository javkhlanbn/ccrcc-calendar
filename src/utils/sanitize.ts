// RichTextEditor-ийн гаргасан HTML-ийг аюулгүй болгож цэвэрлэнэ (stored XSS-ээс хамгаална).
// Зөвшөөрөгдсөн форматлах таг, аюулгүй атрибутуудыг л үлдээж, script, event handler,
// javascript:/data: холбоос зэргийг устгана.

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
  'H1', 'H2', 'H3', 'H4', 'P', 'DIV', 'SPAN', 'BR',
  'UL', 'OL', 'LI', 'MARK', 'FONT', 'A', 'BLOCKQUOTE',
]);

const TAG_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href', 'target', 'rel']),
  FONT: new Set(['color']),
};
const GLOBAL_ATTRS = new Set(['style']);

const isSafeStyle = (value: string) => !/expression|url\s*\(|javascript:|@import|behavior:/i.test(value);

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  // Сервер талд (DOM байхгүй) дуудагдвал теговийг бүхэлд нь зайлуулж энгийн текст болгоно
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') {
    return dirty.replace(/<[^>]*>/g, '');
  }

  const doc = new DOMParser().parseFromString(dirty, 'text/html');

  const clean = (parent: Element) => {
    Array.from(parent.children).forEach((el) => {
      const tag = el.tagName.toUpperCase();

      if (!ALLOWED_TAGS.has(tag)) {
        // Зөвшөөрөгдөөгүй таг (script, iframe, img гэх мэт) — зөвхөн текстийг нь үлдээнэ
        el.replaceWith(doc.createTextNode(el.textContent || ''));
        return;
      }

      const allowed = TAG_ATTRS[tag] || new Set<string>();
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        if (name.startsWith('on') || (!allowed.has(name) && !GLOBAL_ATTRS.has(name))) {
          el.removeAttribute(attr.name);
          return;
        }
        if (name === 'href') {
          const v = value.trim().toLowerCase();
          if (v.startsWith('javascript:') || v.startsWith('data:') || v.startsWith('vbscript:')) {
            el.removeAttribute('href');
          } else {
            el.setAttribute('rel', 'noopener noreferrer nofollow');
          }
        }
        if (name === 'style' && !isSafeStyle(value)) {
          el.removeAttribute('style');
        }
      });

      clean(el);
    });
  };

  clean(doc.body);
  return doc.body.innerHTML;
}
