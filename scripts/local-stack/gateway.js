// Gateway local no formato do Supabase: /auth/v1, /rest/v1, /functions/v1/<nome>
const http = require('http');

const routes = [
  ['/auth/v1', Number(process.env.AUTH_PORT || 9999)],
  ['/rest/v1', Number(process.env.REST_PORT || 3000)],
];
const functions = JSON.parse(process.env.FUNCTIONS || '{}'); // { "delete-account": 8001 }

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'access-control-expose-headers': 'content-range, content-location',
};

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    let target = null;
    let path = req.url;
    for (const [prefix, port] of routes) {
      if (req.url.startsWith(prefix)) {
        target = port;
        path = req.url.slice(prefix.length) || '/';
      }
    }
    const fn = /^\/functions\/v1\/([\w-]+)/.exec(req.url);
    if (fn && functions[fn[1]]) {
      target = functions[fn[1]];
      path = '/';
    }
    if (!target) {
      res.writeHead(404, cors);
      return res.end('{"error":"not_found"}');
    }
    const proxy = http.request(
      { host: '127.0.0.1', port: target, path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${target}` } },
      (r) => {
        res.writeHead(r.statusCode, { ...r.headers, ...cors });
        r.pipe(res);
      },
    );
    proxy.on('error', (e) => {
      res.writeHead(502, cors);
      res.end(JSON.stringify({ error: 'bad_gateway', message: e.message }));
    });
    req.pipe(proxy);
  })
  .listen(Number(process.env.GATEWAY_PORT || 54321), () => console.log('gateway on', process.env.GATEWAY_PORT || 54321));
