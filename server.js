const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let stockList = [];
let currentId = 1;

let salesList = [];
let currentSaleId = 1;

// ─── Items ────────────────────────────────────────────────────────────────────

app.get('/items', (req, res) => {
  res.json(stockList);
});

app.post('/items', (req, res) => {
  const { name, description, quantity = 0, price = 0 } = req.body;
  const newItem = { id: currentId++, name, description, quantity, price };
  stockList.push(newItem);
  res.status(201).json(newItem);
});

app.patch('/items/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = stockList.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });
  if (req.body.quantity !== undefined) item.quantity = Math.max(0, req.body.quantity);
  if (req.body.price !== undefined) item.price = Math.max(0, req.body.price);
  res.json(item);
});

app.delete('/items/:id', (req, res) => {
  const id = parseInt(req.params.id);
  stockList = stockList.filter((i) => i.id !== id);
  res.status(204).send();
});

// ─── Sales ────────────────────────────────────────────────────────────────────

app.get('/sales', (req, res) => {
  res.json(salesList);
});

app.post('/sales', (req, res) => {
  const { items, paymentMethod } = req.body;

  // Validate stock before touching anything
  for (const saleItem of items) {
    const item = stockList.find((i) => i.id === saleItem.itemId);
    if (!item) {
      return res.status(404).json({ error: `Item ${saleItem.itemId} não encontrado` });
    }
    if (saleItem.quantity > item.quantity) {
      return res.status(400).json({
        error: `Estoque insuficiente para "${item.name}" (disponível: ${item.quantity})`,
      });
    }
  }

  // Decrease stock and snapshot prices at the time of sale
  const saleItems = items.map((saleItem) => {
    const item = stockList.find((i) => i.id === saleItem.itemId);
    item.quantity = Math.max(0, item.quantity - saleItem.quantity);
    return {
      itemId: item.id,
      name: item.name,
      quantity: saleItem.quantity,
      unitPrice: item.price,
    };
  });

  const total = saleItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const sale = {
    id: currentSaleId++,
    items: saleItems,
    paymentMethod,
    total,
    createdAt: new Date().toISOString(),
  };

  salesList.push(sale);
  res.status(201).json(sale);
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
