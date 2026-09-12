const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET || 'development-only-change-me';
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const PUBLIC_PATH = path.join(__dirname, '..', 'public');
const CONTENT_TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function readDb() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function writeDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function id() { return crypto.randomUUID(); }
function hash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function matchesPassword(password, stored) {
  const [salt] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash(password, salt)), Buffer.from(stored));
}
function b64(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function tokenFor(user) {
  const body = b64({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 });
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}
function userFrom(req, db) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!body || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? db.users.find((u) => u.id === payload.sub) : null;
  } catch { return null; }
}
function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' });
  res.end(JSON.stringify(data));
}
function getBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
  });
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt }; }
function requireUser(req, res, db) {
  const user = userFrom(req, db);
  if (!user) send(res, 401, { error: 'Autenticación requerida.' });
  return user;
}
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function productFrom(body) {
  const { name, description = '', price, type = 'service', imageUrl = '', categoryId = '' } = body;
  if (typeof name !== 'string' || !name.trim()) throw new Error('El nombre del producto o servicio es requerido.');
  if (!['product', 'service'].includes(type)) throw new Error('El tipo debe ser "product" o "service".');
  if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) throw new Error('El precio debe ser un número mayor o igual a cero.');
  return { name: name.trim(), description: String(description), price: price === undefined ? 0 : Number(price), type, imageUrl: String(imageUrl), categoryId: String(categoryId) };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname.replace(/\/$/, '') || '/';
  const db = readDb();
  try {
    if (req.method === 'GET' && (route === '/' || route.startsWith('/assets/'))) {
      const requested = route === '/' ? 'index.html' : route.slice(1);
      const filePath = path.resolve(PUBLIC_PATH, requested);
      if (!filePath.startsWith(PUBLIC_PATH) || !fs.existsSync(filePath)) return send(res, 404, { error: 'Archivo no encontrado.' });
      res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(filePath));
    }
    if (req.method === 'GET' && route === '/health') return send(res, 200, { ok: true, service: 'bca-tourism-api' });
    if (req.method === 'POST' && route === '/auth/register') {
      const { name, email, password } = await getBody(req);
      if (!name || !isValidEmail(String(email)) || !password || password.length < 8) return send(res, 400, { error: 'Nombre, correo válido y contraseña de al menos 8 caracteres son requeridos.' });
      if (db.users.some((u) => u.email === email.toLowerCase())) return send(res, 409, { error: 'El correo ya está registrado.' });
      const user = { id: id(), name, email: email.toLowerCase(), passwordHash: hash(password), createdAt: new Date().toISOString() };
      db.users.push(user); writeDb(db);
      return send(res, 201, { user: publicUser(user), token: tokenFor(user) });
    }
    if (req.method === 'POST' && route === '/auth/login') {
      const { email, password } = await getBody(req);
      const user = db.users.find((u) => u.email === String(email).toLowerCase());
      if (!user || !matchesPassword(password || '', user.passwordHash)) return send(res, 401, { error: 'Correo o contraseña incorrectos.' });
      return send(res, 200, { user: publicUser(user), token: tokenFor(user) });
    }
    if (req.method === 'POST' && route === '/users') {
      const { name, email, password } = await getBody(req);
      if (!name || !isValidEmail(String(email)) || !password || password.length < 8) return send(res, 400, { error: 'Nombre, correo válido y contraseña de al menos 8 caracteres son requeridos.' });
      const normalizedEmail = email.toLowerCase();
      if (db.users.some((user) => user.email === normalizedEmail)) return send(res, 409, { error: 'El correo ya está registrado.' });
      const user = { id: id(), name: String(name).trim(), email: normalizedEmail, passwordHash: hash(password), createdAt: new Date().toISOString() };
      db.users.push(user); writeDb(db);
      return send(res, 201, { data: publicUser(user), token: tokenFor(user) });
    }
    if (req.method === 'GET' && route === '/users') {
      const user = requireUser(req, res, db); if (!user) return;
      return send(res, 200, { data: [publicUser(user)] });
    }
    const userMatch = route.match(/^\/users\/([^/]+)$/);
    if (userMatch && ['GET', 'PUT', 'DELETE'].includes(req.method)) {
      const currentUser = requireUser(req, res, db); if (!currentUser) return;
      const target = db.users.find((user) => user.id === userMatch[1]);
      if (!target) return send(res, 404, { error: 'Usuario no encontrado.' });
      if (target.id !== currentUser.id) return send(res, 403, { error: 'No puedes gestionar otro usuario.' });
      if (req.method === 'GET') return send(res, 200, { data: publicUser(target) });
      if (req.method === 'PUT') {
        const body = await getBody(req);
        if (body.name !== undefined && (!String(body.name).trim())) return send(res, 400, { error: 'El nombre no puede estar vacío.' });
        if (body.email !== undefined) {
          const email = String(body.email).toLowerCase();
          if (!isValidEmail(email)) return send(res, 400, { error: 'El correo no es válido.' });
          if (db.users.some((user) => user.id !== target.id && user.email === email)) return send(res, 409, { error: 'El correo ya está registrado.' });
          target.email = email;
        }
        if (body.name !== undefined) target.name = String(body.name).trim();
        if (body.password !== undefined) {
          if (typeof body.password !== 'string' || body.password.length < 8) return send(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
          target.passwordHash = hash(body.password);
        }
        target.updatedAt = new Date().toISOString(); writeDb(db);
        return send(res, 200, { data: publicUser(target), token: tokenFor(target) });
      }
      db.users = db.users.filter((user) => user.id !== target.id);
      db.favorites = db.favorites.filter((favorite) => favorite.userId !== target.id);
      db.reviews = db.reviews.filter((review) => review.userId !== target.id);
      writeDb(db); return send(res, 200, { ok: true, message: 'Usuario eliminado.' });
    }
    db.products ||= [];
    if (req.method === 'GET' && route === '/products') return send(res, 200, { data: db.products, meta: { total: db.products.length } });
    if (req.method === 'POST' && route === '/products') {
      const user = requireUser(req, res, db); if (!user) return;
      const product = { id: id(), ...productFrom(await getBody(req)), createdBy: user.id, createdAt: new Date().toISOString(), updatedAt: null };
      db.products.push(product); writeDb(db); return send(res, 201, { data: product });
    }
    const productMatch = route.match(/^\/products\/([^/]+)$/);
    if (productMatch && ['GET', 'PUT', 'DELETE'].includes(req.method)) {
      const product = db.products.find((item) => item.id === productMatch[1]);
      if (!product) return send(res, 404, { error: 'Producto o servicio no encontrado.' });
      if (req.method === 'GET') return send(res, 200, { data: product });
      const user = requireUser(req, res, db); if (!user) return;
      if (product.createdBy !== user.id) return send(res, 403, { error: 'No puedes gestionar un producto o servicio de otro usuario.' });
      if (req.method === 'PUT') {
        const body = await getBody(req);
        const completeProduct = productFrom({ ...product, ...body });
        Object.assign(product, completeProduct, { updatedAt: new Date().toISOString() }); writeDb(db);
        return send(res, 200, { data: product });
      }
      db.products = db.products.filter((item) => item.id !== product.id);
      writeDb(db); return send(res, 200, { ok: true, message: 'Producto o servicio eliminado.' });
    }
    if (req.method === 'GET' && route === '/categories') return send(res, 200, { data: db.categories });
    if (req.method === 'GET' && route === '/places') {
      const query = (url.searchParams.get('q') || '').toLowerCase();
      const category = url.searchParams.get('category');
      let places = db.places.filter((place) => !category || place.categoryId === category);
      if (query) places = places.filter((place) => `${place.name} ${place.description} ${place.tags.join(' ')}`.toLowerCase().includes(query));
      return send(res, 200, { data: places, meta: { total: places.length } });
    }
    const placeMatch = route.match(/^\/places\/([^/]+)$/);
    if (req.method === 'GET' && placeMatch) {
      const place = db.places.find((item) => item.id === placeMatch[1]);
      if (!place) return send(res, 404, { error: 'Lugar no encontrado.' });
      const reviews = db.reviews.filter((review) => review.placeId === place.id);
      return send(res, 200, { data: { ...place, reviews } });
    }
    if (req.method === 'POST' && route.match(/^\/places\/([^/]+)\/reviews$/)) {
      const user = userFrom(req, db); if (!user) return send(res, 401, { error: 'Inicia sesión para dejar una reseña.' });
      const placeId = route.split('/')[2]; const place = db.places.find((item) => item.id === placeId);
      const { rating, comment = '' } = await getBody(req);
      if (!place) return send(res, 404, { error: 'Lugar no encontrado.' });
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return send(res, 400, { error: 'La calificación debe ser un entero entre 1 y 5.' });
      const review = { id: id(), placeId, userId: user.id, authorName: user.name, rating, comment, createdAt: new Date().toISOString() };
      db.reviews.push(review); writeDb(db); return send(res, 201, { data: review });
    }
    if (req.method === 'GET' && route === '/me/favorites') {
      const user = userFrom(req, db); if (!user) return send(res, 401, { error: 'Inicia sesión.' });
      const ids = new Set(db.favorites.filter((item) => item.userId === user.id).map((item) => item.placeId));
      return send(res, 200, { data: db.places.filter((place) => ids.has(place.id)) });
    }
    const favoriteMatch = route.match(/^\/me\/favorites\/([^/]+)$/);
    if (favoriteMatch && ['POST', 'DELETE'].includes(req.method)) {
      const user = userFrom(req, db); if (!user) return send(res, 401, { error: 'Inicia sesión.' });
      const placeId = favoriteMatch[1]; if (!db.places.some((place) => place.id === placeId)) return send(res, 404, { error: 'Lugar no encontrado.' });
      if (req.method === 'POST' && !db.favorites.some((item) => item.userId === user.id && item.placeId === placeId)) db.favorites.push({ userId: user.id, placeId, createdAt: new Date().toISOString() });
      if (req.method === 'DELETE') db.favorites = db.favorites.filter((item) => item.userId !== user.id || item.placeId !== placeId);
      writeDb(db); return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'Ruta no encontrada.' });
  } catch (error) {
    return send(res, 400, { error: error.message || 'No se pudo procesar la solicitud.' });
  }
});

server.listen(PORT, () => console.log(`BCA API activa en http://localhost:${PORT}`));
