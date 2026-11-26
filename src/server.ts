const port = Number(process.env.PORT ?? 3000);
const root = new URL('../dist/', import.meta.url).pathname;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function safePath(reqPath: string): string | null {
  const clean = reqPath.split('?')[0] ?? '/';
  const normalized = clean.replace(/^\/+/, '');
  if (normalized.includes('..')) return null;
  const filePath = root + (normalized === '' ? 'index.html' : normalized);
  return filePath;
}

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let path = safePath(url.pathname);
    if (path === null) return new Response('Forbidden', { status: 403 });

    let file = Bun.file(path);
    let exists = await file.exists();
    if (!exists) {
      // fall back to index.html for client-side routes
      path = root + 'index.html';
      file = Bun.file(path);
      exists = await file.exists();
      if (!exists) {
        return new Response('Not found — run `bun run build` first', { status: 404 });
      }
    }

    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    return new Response(file, {
      headers: {
        'content-type': contentType,
        'cache-control': 'no-cache',
      },
    });
  },
});

console.log(`Kart racer dev server: http://localhost:${port}/`);
