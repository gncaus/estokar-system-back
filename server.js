const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// "Banco de dados" temporário (array em memória)
let stockList = [];
let currentId = 1;

// ROTAS

// GET - Listar todos os itens
app.get('/items', (req, res) => {
  res.json(stockList);
});

// POST - Criar novo item
app.post('/items', (req, res) => {
  const { name, description } = req.body;
  const newItem = {
    id: currentId++,
    name,
    description
  };
  stockList.push(newItem);
  res.status(201).json(newItem);
});

// DELETE - Remover item
app.delete('/items/:id', (req, res) => {
  const { id } = req.params;
  stockList = stockList.filter(item => item.id !== parseInt(id));
  res.status(204).send();
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});