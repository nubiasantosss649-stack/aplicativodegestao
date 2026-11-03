#!/usr/bin/env node
/**
 * Gera as páginas públicas exigidas pelas lojas a partir de src/content/legal.json:
 *   site/privacidade.html  (URL da Política de Privacidade — Play Console e App Store Connect)
 *   site/termos.html       (Termos de Uso / EULA)
 *   site/excluir-conta.html (URL de exclusão de conta — exigência da Google Play)
 *   site/index.html
 * Publique a pasta site/ em qualquer hospedagem estática (GitHub Pages, Netlify, Vercel...).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const legal = JSON.parse(fs.readFileSync(path.join(root, 'src/content/legal.json'), 'utf8'));
const out = path.join(root, 'site');
fs.mkdirSync(out, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fill = (t) =>
  t.replace(/\{email\}/g, legal.contact.email).replace(/\{controller\}/g, legal.contact.controller).replace(/\{dpo\}/g, legal.contact.dpo);

const page = (title, body) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)} · Gestão Fácil IA</title>
<style>
  :root { --bg:#F8FAFC; --fg:#0F172A; --muted:#64748B; --primary:#1E40AF; --card:#FFFFFF; --border:#E2E8F0; }
  @media (prefers-color-scheme: dark) { :root { --bg:#020617; --fg:#F8FAFC; --muted:#94A3B8; --primary:#93B4FF; --card:#0F172A; --border:#1E293B; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { color: var(--primary); margin-bottom: 4px; } h2 { font-size: 18px; margin-top: 28px; }
  .muted { color: var(--muted); font-size: 14px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; margin-top: 16px; }
  a { color: var(--primary); } nav a { margin-right: 16px; }
</style></head>
<body><main>
<nav class="muted"><a href="index.html">Início</a><a href="privacidade.html">Privacidade</a><a href="termos.html">Termos</a><a href="excluir-conta.html">Excluir conta</a></nav>
${body}
<p class="muted" style="margin-top:40px">Gestão Fácil IA — Seu negócio organizado, suas vendas crescendo.</p>
</main></body></html>
`;

const docPage = (doc) =>
  page(
    doc.title,
    `<h1>${esc(doc.title)}</h1><p class="muted">Última atualização: ${esc(doc.updatedAt)}</p>` +
      doc.sections.map((s) => `<h2>${esc(s.heading)}</h2><p>${esc(fill(s.body))}</p>`).join('\n'),
  );

fs.writeFileSync(path.join(out, 'privacidade.html'), docPage(legal.privacy));
fs.writeFileSync(path.join(out, 'termos.html'), docPage(legal.terms));
fs.writeFileSync(
  path.join(out, 'excluir-conta.html'),
  page(
    'Excluir conta',
    `<h1>Excluir sua conta do Gestão Fácil IA</h1>
<div class="card"><h2>Pelo aplicativo (imediato)</h2>
<ol><li>Abra o app e entre na sua conta.</li><li>Toque em <b>Mais → Configurações → Excluir minha conta</b>.</li>
<li>Digite <b>EXCLUIR</b> e confirme.</li></ol>
<p>Antes, se quiser, exporte seus dados em <b>Configurações → Exportar meus dados</b>.</p></div>
<div class="card"><h2>Sem acesso ao aplicativo</h2>
<p>Envie um e-mail para <b>${esc(legal.contact.email)}</b>, a partir do e-mail cadastrado, com o assunto <b>“Excluir minha conta”</b>.
Confirmaremos a solicitação e concluiremos a exclusão em até 15 dias.</p></div>
<div class="card"><h2>O que é excluído</h2>
<p>Login, perfil, negócios de que você é dono e todos os dados deles (produtos, fotos, estoque, clientes, vendas, fiados,
financeiro, recibos e orçamentos), além do seu acesso a negócios de outras pessoas. Cópias de segurança do provedor são
eliminadas no ciclo de retenção (até 30 dias). Registros mínimos exigidos por lei podem ser mantidos pelo prazo legal.</p>
<p><b>Assinatura:</b> excluir a conta não cancela a cobrança na Google Play ou App Store. Cancele a assinatura na loja.</p></div>`,
  ),
);
fs.writeFileSync(
  path.join(out, 'index.html'),
  page(
    'Gestão Fácil IA',
    `<h1>Gestão Fácil IA</h1><p>Seu negócio organizado, suas vendas crescendo.</p>
<p>Vendas, estoque, clientes, fiados, financeiro, recibos e orçamentos para MEIs e pequenos negócios — com Assistente IA no plano Pro.</p>
<p>Suporte: ${esc(legal.contact.email)}</p>`,
  ),
);
console.log('Páginas geradas em', out);
