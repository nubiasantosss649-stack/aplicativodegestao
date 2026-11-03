/**
 * Capturas de tela para as lojas a partir do app real (build web) com a conta
 * de demonstração (e2e/seed-demo.sh). Uso:
 *   APP_URL=http://localhost:8081 OUT=./store/screenshots node e2e/screenshots.js
 */
const { chromium } = require('playwright');
const fs = require('fs');

const APP = process.env.APP_URL || 'http://localhost:8081';
const OUT = process.env.OUT || 'store/screenshots';
const DEVICES = [
  { name: 'ios-6.9', viewport: { width: 430, height: 932 }, scale: 3 },      // 1290 x 2796
  { name: 'android-phone', viewport: { width: 360, height: 720 }, scale: 3 }, // 1080 x 2160
];

(async () => {
  const browser = await chromium.launch();
  for (const device of DEVICES) {
    const dir = `${OUT}/${device.name}`;
    fs.mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: device.viewport, deviceScaleFactor: device.scale, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    page.on('dialog', (d) => d.accept());
    const visible = (l) => l.filter({ visible: true }).first();
    const see = (t) => visible(page.getByText(t, { exact: true })).waitFor({ timeout: 20000 });
    const shot = async (n) => {
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${dir}/${n}.png` });
    };

    await page.goto(`${APP}/sign-in`);
    await visible(page.getByLabel('E-mail', { exact: true })).fill('demo@gestaofacil.app');
    await visible(page.getByLabel('Senha', { exact: true })).fill('demo12345');
    await visible(page.getByRole('button', { name: 'Entrar', exact: true })).click();
    await see('Vendas de hoje');
    await shot('01-dashboard');

    await page.goto(`${APP}/sell`);
    await visible(page.getByLabel('Buscar produto ou código')).fill('Arroz');
    await visible(page.getByText('Arroz Tipo 1 5kg', { exact: true })).click();
    await visible(page.getByLabel('Buscar produto ou código')).fill('Café');
    await visible(page.getByText('Café Torrado 500g', { exact: true })).click();
    await visible(page.getByLabel('Buscar produto ou código')).fill('');
    await visible(page.getByRole('button', { name: 'Aumentar quantidade' })).click();
    await page.waitForTimeout(3200); // aguarda o aviso "adicionado" sumir
    await shot('02-venda-rapida');

    await visible(page.getByRole('button', { name: 'Ir para pagamento', exact: true })).click();
    await see('Total a pagar');
    await visible(page.getByRole('radio', { name: 'Pix' })).click();
    await shot('03-pagamento');

    await page.goto(`${APP}/receivables`);
    await see('Total a receber');
    await shot('04-fiados');

    await page.goto(`${APP}/assistant`);
    await see('Experimente perguntar:');
    await shot('05-assistente-ia');

    await page.goto(`${APP}/reports`);
    await see('Vendas por dia da semana');
    await shot('06-relatorios');

    await page.goto(`${APP}/insights`);
    await see('Possíveis prejuízos');
    await shot('07-recomendacoes');

    await page.goto(`${APP}/products`);
    await see('Novo produto');
    await shot('08-produtos');

    await page.goto(`${APP}/finance`);
    await see('Fluxo de caixa');
    await shot('09-financeiro');

    await page.close();
    console.log('✔', device.name);
  }
  await browser.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
