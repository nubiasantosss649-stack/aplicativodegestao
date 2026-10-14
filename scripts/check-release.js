#!/usr/bin/env node
/** Bloqueia o build de produção enquanto houver pendências de publicação. */
const fs = require('fs');
const path = require('path');

// No EAS, roda em todo build mas só bloqueia o perfil de produção
if (process.argv.includes('--if-production') && process.env.EAS_BUILD_PROFILE !== 'production') {
  console.log(`check:release ignorado (perfil ${process.env.EAS_BUILD_PROFILE ?? 'local'})`);
  process.exit(0);
}

const root = path.resolve(__dirname, '..');
const problems = [];

const legal = fs.readFileSync(path.join(root, 'src/content/legal.json'), 'utf8');
if (legal.includes('[PREENCHER')) problems.push('src/content/legal.json: preencha responsável, e-mail e encarregado ([PREENCHER]).');

const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
if (!app.ios?.bundleIdentifier || !app.android?.package) problems.push('app.json: defina ios.bundleIdentifier e android.package.');

const env = process.env;
if (env.EXPO_PUBLIC_APP_ENV !== 'production') problems.push('EXPO_PUBLIC_APP_ENV deve ser "production" no build de produção.');
for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', 'EXPO_PUBLIC_REVENUECAT_IOS_KEY']) {
  if (!env[key]) problems.push(`${key} não definido.`);
}
if (/service_role|sk_[a-z0-9]|sk-ant-/i.test(Object.entries(env).filter(([k]) => k.startsWith('EXPO_PUBLIC_')).map(([, v]) => v).join(' '))) {
  problems.push('Uma variável EXPO_PUBLIC_ parece conter chave SECRETA. Variáveis EXPO_PUBLIC_ vão para o app.');
}

if (problems.length) {
  console.error('❌ Pendências para publicação:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('✅ Pronto para build de produção.');
