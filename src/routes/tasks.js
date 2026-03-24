const express = require('express');
const { listTasks, createTask, updateTask, completeTask, deleteTask } = require('../services/taskManager');
const { logger } = require('../utils/logger');

const router = express.Router();

// ─── GET /tasks ───────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { status } = req.query;
  res.json({ tasks: listTasks({ status }) });
});

// ─── POST /tasks ──────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const task = createTask(req.body || {});
    res.status(201).json(task);
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

// ─── PUT /tasks/:id ───────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const task = updateTask(req.params.id, req.body || {});
    res.json(task);
  } catch(e) {
    res.status(404).json({ error: e.message });
  }
});

// ─── DELETE /tasks/:id ────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const task = deleteTask(req.params.id);
    res.json({ message: 'Tarefa removida', task });
  } catch(e) {
    res.status(404).json({ error: e.message });
  }
});

// ─── POST /tasks/:id/complete ─────────────────────────────────────────────────
router.post('/:id/complete', (req, res) => {
  try {
    const task = completeTask(req.params.id);
    res.json({ message: 'Tarefa concluída', task });
  } catch(e) {
    res.status(404).json({ error: e.message });
  }
});

module.exports = router;
