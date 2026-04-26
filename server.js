const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let stockList = [];
let currentId = 1;

app.get('/items', (req, res) => {
  res.json(stockList);
});

app.post('/items', (req, res) => {
  const { name, description, quantity = 0 } = req.body;
  const newItem = { id: currentId++, name, description, quantity };
  stockList.push(newItem);
  res.status(201).json(newItem);
});

// Atualiza a quantidade de um item (usado para entrada e venda)
app.patch('/items/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = stockList.find((i) => i.id === id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });
  item.quantity = Math.max(0, req.body.quantity);
  res.json(item);
});

app.delete('/items/:id', (req, res) => {
  const id = parseInt(req.params.id);
  stockList = stockList.filter((i) => i.id !== id);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
