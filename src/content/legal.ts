import legal from './legal.json';

/**
 * Termos de Uso e Política de Privacidade. Fonte única (legal.json) usada
 * pelo app e pelas páginas públicas geradas em site/ (scripts/build-site.js).
 * Os campos [PREENCHER] devem ser completados antes da publicação
 * (verificação automática: npm run check:release).
 */
export interface LegalDoc {
  title: string;
  updatedAt: string;
  sections: { heading: string; body: string }[];
}

const fill = (text: string) =>
  text
    .replace(/\{email\}/g, legal.contact.email)
    .replace(/\{controller\}/g, legal.contact.controller)
    .replace(/\{dpo\}/g, legal.contact.dpo);

function resolve(doc: LegalDoc): LegalDoc {
  return { ...doc, sections: doc.sections.map((s) => ({ heading: s.heading, body: fill(s.body) })) };
}

export const TERMS: LegalDoc = resolve(legal.terms);
export const PRIVACY: LegalDoc = resolve(legal.privacy);
export const SUPPORT_EMAIL = legal.contact.email;
