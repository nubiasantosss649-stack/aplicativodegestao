/**
 * Teste de ponta a ponta na interface real (build web) contra o backend local
 * (scripts/local-stack). Uso:
 *   APP_URL=http://localhost:8081 SHOTS=./shots node e2e/flow.e2e.js
 */
const { chromium } = require('playwright');

const APP = process.env.APP_URL || 'http://localhost:8081';
const SHOTS = process.env.SHOTS || '/tmp/e2e-shots';
const email = `e2e+${Date.now()}@teste.com`;
const steps = [];

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    steps.push(`✔ ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    steps.push(`✘ ${name}: ${e.message.split('\n')[0]}`);
    throw e;
  }
}

(async () => {
  require('fs').mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept()); // confirmações (window.confirm)
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
  const visible = (l) => l.filter({ visible: true }).first();
  const btn = (name) => visible(page.getByRole('button', { name, exact: true }));
  const field = (label) => visible(page.getByLabel(label, { exact: true }));
  const see = (text, timeout = 15000) => visible(page.getByText(text, { exact: typeof text === 'string' })).waitFor({ timeout });
  const tap = (text) => visible(page.getByText(text, { exact: typeof text === 'string' })).click();

  try {
    await step('cadastro', async () => {
      await page.goto(APP);
      await tap('Pular');
      await tap('Criar conta grátis');
      await field('Seu nome').fill('Maria Souza');
      await field('E-mail').fill(email);
      await field('Senha').fill('senha12345');
      await field('Confirme a senha').fill('senha12345');
      await visible(page.getByRole('checkbox')).click();
      await btn('Criar conta').click();
      await see('Seu negócio', 15000);
    });

    await step('cadastro do negócio (com CPF)', async () => {
      await field('Nome do negócio').fill('Mercadinho da Maria');
      await tap('Mercadinho / mercearia');
      await field('CPF ou CNPJ (opcional)').fill('52998224725');
      await field('Telefone / WhatsApp (opcional)').fill('11988887777');
      await btn('Começar a usar').click();
      await see('Vendas de hoje', 15000);
      await shot('e2e-01-dashboard-vazio');
    });

    await step('novo produto com estoque e margem', async () => {
      await tap('Produtos');
      await btn('Novo produto').click();
      await field('Nome do produto ou serviço').fill('Arroz 5kg');
      await field('Custo').fill('1800');
      await field('Preço de venda').fill('2590');
      await see('30,5%'); // margem calculada
      await field('Estoque inicial').fill('20');
      await field('Estoque mínimo').fill('5');
      await btn('Salvar produto').click();
      await see('Em estoque', 10000);
      await see('20 un');
    });

    await step('novo cliente', async () => {
      await page.goto(`${APP}/customers/new`);
      await field('Nome').fill('Carlos Pereira');
      await field('Telefone / WhatsApp').fill('11977776666');
      await btn('Salvar cliente').click();
      await see('Cliente cadastrado!', 10000);
    });

    await step('venda à vista com troco', async () => {
      await page.goto(`${APP}/sell`);
      await visible(page.getByLabel('Buscar produto ou código')).fill('Arroz');
      await tap('Arroz 5kg');
      await btn('Aumentar quantidade').click();
      await btn('Ir para pagamento').click();
      await field('Valor recebido em dinheiro (opcional)').fill('6000');
      await see('R$ 8,20'); // troco de 60,00 - 51,80
      await visible(page.getByRole('button', { name: /Finalizar venda/ })).click();
      await see('Venda #1', 15000);
      await shot('e2e-02-venda-concluida');
    });

    await step('venda fiado para cliente', async () => {
      await page.goto(`${APP}/sell`);
      await visible(page.getByLabel('Buscar produto ou código')).fill('Arroz');
      await tap('Arroz 5kg');
      await btn('Ir para pagamento').click();
      await tap('Consumidor (sem cliente)');
      await tap('Carlos Pereira');
      await visible(page.getByRole('radio', { name: 'Fiado' })).click();
      await see('Fiado não entra como dinheiro recebido');
      await visible(page.getByRole('button', { name: /Finalizar venda/ })).click();
      await see('Venda #2', 15000);
    });

    await step('dashboard: faturamento x recebido x fiado', async () => {
      await page.goto(APP);
      await see('R$ 77,70', 15000); // faturamento 51,80 + 25,90
      await see('R$ 51,80'); // recebido (fiado não conta)
      await see('R$ 25,90'); // a receber
      await shot('e2e-03-dashboard');
    });

    await step('recebimento parcial do fiado', async () => {
      await page.goto(`${APP}/receivables`);
      await tap('Carlos Pereira');
      await btn('Registrar pagamento').click();
      await field('Valor recebido').fill('1000');
      await btn('Confirmar recebimento').click();
      await see('R$ 15,90', 10000);
      await shot('e2e-04-fiado');
    });

    await step('estoque baixado pelas vendas', async () => {
      await page.goto(`${APP}/products`);
      await see('Estoque: 17 un', 10000);
    });

    await step('despesa no financeiro', async () => {
      await page.goto(`${APP}/finance/new?kind=expense`);
      await field('Descrição').fill('Conta de luz');
      await field('Valor').fill('12000');
      await btn('Salvar lançamento').click();
      await see('Lançamento salvo!', 10000);
    });

    await step('plano grátis: relatórios bloqueados com convite ao Pro', async () => {
      await page.goto(`${APP}/reports`);
      await see('Relatórios detalhados', 10000);
      await btn('Conhecer o Pro IA').click();
      await see('Descubra onde seu negócio está perdendo dinheiro.');
      await see('Assinaturas indisponíveis nesta versão');
    });

    await step('cancelamento de venda devolve estoque', async () => {
      await page.goto(`${APP}/sales`);
      await tap('Venda #1');
      await btn('Cancelar venda').click();
      await field('Motivo do cancelamento').fill('Cliente desistiu');
      await btn('Confirmar cancelamento').click();
      await see('Cancelada', 10000);
      await page.goto(`${APP}/products`);
      await see('Estoque: 19 un', 10000);
    });

    await step('exclusão de conta', async () => {
      await page.goto(`${APP}/settings/delete-account`);
      await field('Para confirmar, digite "EXCLUIR"').fill('EXCLUIR');
      await btn('Excluir minha conta').click();
      await see('Entrar', 15000);
    });

    await step('conta excluída não consegue entrar', async () => {
      await field('E-mail').fill(email);
      await field('Senha').fill('senha12345');
      await btn('Entrar').click();
      await see('E-mail ou senha incorretos.', 10000);
    });
  } catch {
    await shot('e2e-falha');
  } finally {
    console.log(steps.join('\n'));
    if (errors.length) console.log('Erros de página:', errors.slice(0, 5));
    await browser.close();
    process.exit(steps.some((s) => s.startsWith('✘')) ? 1 : 0);
  }
})();
