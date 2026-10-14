// Gera chaves anon/service_role (JWT HS256) a partir do segredo local
const crypto = require('crypto');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (payload, secret) => {
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${data}.${crypto.createHmac('sha256', secret).update(data).digest('base64url')}`;
};
const secret = process.argv[2];
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
console.log(`ANON_KEY=${sign({ role: 'anon', iss: 'supabase-local', exp }, secret)}`);
console.log(`SERVICE_ROLE_KEY=${sign({ role: 'service_role', iss: 'supabase-local', exp }, secret)}`);
