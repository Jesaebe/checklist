const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const db = new DatabaseSync(path.join(__dirname, 'tarefas.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL CHECK(priority IN ('baixa', 'media', 'alta')),
    due_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );
`);

const listTasks = db.prepare(`
  SELECT id, title, description, priority, due_date AS dueDate,
         created_at AS createdAt, completed_at AS completedAt
  FROM tasks
  ORDER BY completed_at IS NOT NULL, due_date ASC,
           CASE priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
           id DESC
`);
const getTask = db.prepare(`
  SELECT id, title, description, priority, due_date AS dueDate,
         created_at AS createdAt, completed_at AS completedAt
  FROM tasks WHERE id = ?
`);
const insertTask = db.prepare(`
  INSERT INTO tasks (title, description, priority, due_date, created_at)
  VALUES (?, ?, ?, ?, ?)
`);
const updateTask = db.prepare(`
  UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?
  WHERE id = ?
`);
const toggleTask = db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?');
const deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Payload muito grande.');
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('JSON inválido.');
  }
}

function validateTask(input) {
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const priority = String(input.priority || 'media');
  const dueDate = String(input.dueDate || '');

  if (!title) throw new Error('Informe o título da atividade.');
  if (title.length > 120) throw new Error('O título deve ter no máximo 120 caracteres.');
  if (description.length > 2000) throw new Error('A descrição deve ter no máximo 2000 caracteres.');
  if (!['baixa', 'media', 'alta'].includes(priority)) throw new Error('Prioridade inválida.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Informe uma data limite válida.');
  return { title, description, priority, dueDate };
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/tasks' && req.method === 'GET') {
    return sendJson(res, 200, listTasks.all());
  }

  if (url.pathname === '/api/tasks' && req.method === 'POST') {
    const task = validateTask(await readJson(req));
    const result = insertTask.run(
      task.title, task.description, task.priority, task.dueDate, new Date().toISOString()
    );
    return sendJson(res, 201, getTask.get(result.lastInsertRowid));
  }

  const match = url.pathname.match(/^\/api\/tasks\/(\d+)(?:\/(toggle))?$/);
  if (!match) return sendJson(res, 404, { error: 'Rota não encontrada.' });

  const id = Number(match[1]);
  const current = getTask.get(id);
  if (!current) return sendJson(res, 404, { error: 'Atividade não encontrada.' });

  if (match[2] === 'toggle' && req.method === 'PATCH') {
    toggleTask.run(current.completedAt ? null : new Date().toISOString(), id);
    return sendJson(res, 200, getTask.get(id));
  }

  if (req.method === 'PUT') {
    const task = validateTask(await readJson(req));
    updateTask.run(task.title, task.description, task.priority, task.dueDate, id);
    return sendJson(res, 200, getTask.get(id));
  }

  if (req.method === 'DELETE') {
    deleteTask.run(id);
    res.writeHead(204);
    return res.end();
  }

  return sendJson(res, 405, { error: 'Método não permitido.' });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

async function serveStatic(res, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, requested);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return sendJson(res, 403, { error: 'Acesso negado.' });
  }
  try {
    const file = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: 'Arquivo não encontrado.' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(res, url.pathname);
  } catch (error) {
    const expected = !error.code || error.code.startsWith('SQLITE_CONSTRAINT');
    if (!expected) console.error(error);
    return sendJson(res, expected ? 400 : 500, {
      error: expected ? error.message : 'Erro interno do servidor.'
    });
  }
});

server.listen(PORT, () => {
  console.log(`Checklist disponível em http://localhost:${PORT}`);
});

module.exports = { server, db };
