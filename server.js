const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const DATABASE_URL = process.env.DATABASE_URL;
// Local Postgres usually has SSL disabled; hosted ones (Railway) require it
const isLocalDb = !DATABASE_URL || /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(DATABASE_URL);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

// ─── DB init ──────────────────────────────────────────────────────────────────

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id          SERIAL PRIMARY KEY,
      name        TEXT           NOT NULL,
      description TEXT           NOT NULL DEFAULT '',
      quantity    INTEGER        NOT NULL DEFAULT 0,
      price       NUMERIC(10,2)  NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS movements (
      id           SERIAL PRIMARY KEY,
      item_id      INTEGER     NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      type         TEXT        NOT NULL,
      quantity     INTEGER     NOT NULL,
      reason       TEXT        NOT NULL,
      balance_after INTEGER    NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales (
      id             SERIAL PRIMARY KEY,
      payment_method TEXT           NOT NULL,
      total          NUMERIC(10,2)  NOT NULL,
      created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id          SERIAL PRIMARY KEY,
      sale_id     INTEGER       NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      item_id     INTEGER       NOT NULL,
      name        TEXT          NOT NULL,
      quantity    INTEGER       NOT NULL,
      unit_price  NUMERIC(10,2) NOT NULL
    );
  `);
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapItem(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    quantity: row.quantity,
    price: parseFloat(row.price),
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    type: row.type,
    quantity: row.quantity,
    reason: row.reason,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
  };
}

function mapSale(row) {
  return {
    id: row.id,
    items: row.items || [],
    paymentMethod: row.payment_method,
    total: parseFloat(row.total),
    createdAt: row.created_at,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['pix', 'card', 'cash'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isNonNegativeNumber(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function validateSaleBody(body) {
  const { items, paymentMethod } = body || {};
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return `paymentMethod deve ser um de: ${PAYMENT_METHODS.join(', ')}`;
  }
  if (!Array.isArray(items) || items.length === 0) {
    return 'items deve ser uma lista com pelo menos um item';
  }
  const seen = new Set();
  for (const saleItem of items) {
    const itemId = parseId(saleItem?.itemId);
    if (!itemId) return 'Cada item precisa de um itemId válido';
    if (!Number.isInteger(saleItem.quantity) || saleItem.quantity <= 0) {
      return `Quantidade inválida para o item ${itemId}`;
    }
    if (seen.has(itemId)) return `Item ${itemId} repetido na venda`;
    seen.add(itemId);
  }
  return null;
}

// ─── Items ────────────────────────────────────────────────────────────────────

app.get('/items', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM items ORDER BY id');
  res.json(rows.map(mapItem));
});

app.post('/items', async (req, res) => {
  const { name, description = '', quantity = 0, price = 0 } = req.body || {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }
  if (typeof description !== 'string') {
    return res.status(400).json({ error: 'Descrição inválida' });
  }
  if (!isNonNegativeNumber(quantity) || !isNonNegativeNumber(price)) {
    return res.status(400).json({ error: 'Quantidade e preço devem ser números maiores ou iguais a 0' });
  }
  const qty  = Math.max(0, parseInt(quantity)   || 0);
  const prc   = Math.max(0, parseFloat(price)    || 0);

  const { rows } = await pool.query(
    'INSERT INTO items (name, description, quantity, price) VALUES ($1, $2, $3, $4) RETURNING *',
    [name.trim(), description, qty, prc],
  );
  const item = rows[0];

  if (qty > 0) {
    await pool.query(
      'INSERT INTO movements (item_id, type, quantity, reason, balance_after) VALUES ($1, $2, $3, $4, $5)',
      [item.id, 'entrada', qty, 'Cadastro inicial', qty],
    );
  }

  res.status(201).json(mapItem(item));
});

app.patch('/items/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const body = req.body || {};
  if (body.quantity === undefined && body.price === undefined) {
    return res.status(400).json({ error: 'Informe quantity e/ou price' });
  }
  if ((body.quantity !== undefined && !isNonNegativeNumber(body.quantity))
    || (body.price !== undefined && !isNonNegativeNumber(body.price))) {
    return res.status(400).json({ error: 'Quantidade e preço devem ser números maiores ou iguais a 0' });
  }

  const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Item não encontrado' });

  const item = rows[0];

  if (req.body.quantity !== undefined) {
    const newQty = Math.max(0, parseInt(req.body.quantity) || 0);
    const delta  = newQty - item.quantity;
    if (delta !== 0) {
      await pool.query('UPDATE items SET quantity = $1 WHERE id = $2', [newQty, id]);
      await pool.query(
        'INSERT INTO movements (item_id, type, quantity, reason, balance_after) VALUES ($1, $2, $3, $4, $5)',
        [id, delta > 0 ? 'entrada' : 'ajuste', delta, delta > 0 ? 'Entrada manual' : 'Ajuste manual', newQty],
      );
    }
  }

  if (req.body.price !== undefined) {
    const newPrice = Math.max(0, parseFloat(req.body.price) || 0);
    await pool.query('UPDATE items SET price = $1 WHERE id = $2', [newPrice, id]);
  }

  const { rows: updated } = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
  res.json(mapItem(updated[0]));
});

app.delete('/items/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  await pool.query('DELETE FROM items WHERE id = $1', [id]);
  res.status(204).send();
});

// ─── Movements ────────────────────────────────────────────────────────────────

app.get('/items/:id/movements', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  const { rows } = await pool.query(
    'SELECT * FROM movements WHERE item_id = $1 ORDER BY created_at DESC',
    [id],
  );
  res.json(rows.map(mapMovement));
});

// ─── Sales ────────────────────────────────────────────────────────────────────

app.get('/sales', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      s.id, s.payment_method, s.total, s.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'itemId',    si.item_id,
            'name',      si.name,
            'quantity',  si.quantity,
            'unitPrice', si.unit_price::float
          ) ORDER BY si.id
        ) FILTER (WHERE si.id IS NOT NULL),
        '[]'
      ) AS items
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);
  res.json(rows.map(mapSale));
});

app.post('/sales', async (req, res) => {
  const validationError = validateSaleBody(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { items, paymentMethod } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Validate stock for all items before touching anything
    const itemRows = [];
    for (const saleItem of items) {
      const { rows } = await client.query('SELECT * FROM items WHERE id = $1 FOR UPDATE', [saleItem.itemId]);
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Item ${saleItem.itemId} não encontrado` });
      }
      if (saleItem.quantity > rows[0].quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Estoque insuficiente para "${rows[0].name}" (disponível: ${rows[0].quantity})`,
        });
      }
      itemRows.push({ item: rows[0], quantity: saleItem.quantity });
    }

    const total = itemRows.reduce((sum, { item, quantity }) => sum + parseFloat(item.price) * quantity, 0);

    const { rows: saleRows } = await client.query(
      'INSERT INTO sales (payment_method, total) VALUES ($1, $2) RETURNING *',
      [paymentMethod, total],
    );
    const sale = saleRows[0];

    const resultItems = [];
    for (const { item, quantity } of itemRows) {
      const newQty = item.quantity - quantity;

      await client.query(
        'INSERT INTO sale_items (sale_id, item_id, name, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)',
        [sale.id, item.id, item.name, quantity, item.price],
      );
      await client.query('UPDATE items SET quantity = $1 WHERE id = $2', [newQty, item.id]);
      await client.query(
        'INSERT INTO movements (item_id, type, quantity, reason, balance_after) VALUES ($1, $2, $3, $4, $5)',
        [item.id, 'saida', -quantity, `Venda #${sale.id}`, newQty],
      );

      resultItems.push({
        itemId: item.id,
        name: item.name,
        quantity,
        unitPrice: parseFloat(item.price),
      });
    }

    await client.query('COMMIT');

    res.status(201).json({
      id: sale.id,
      items: resultItems,
      paymentMethod: sale.payment_method,
      total: parseFloat(sale.total),
      createdAt: sale.created_at,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ─────────────────────────────────────────────────────────────────────────────

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('DATABASE_URL definida:', !!process.env.DATABASE_URL);
    console.error('Erro ao conectar no banco:', err.stack || err.message || err);
    process.exit(1);
  });
