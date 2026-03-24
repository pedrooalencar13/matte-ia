/**
 * taskManager.js
 * Gerenciador de tarefas com persistência em data/tasks.json
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

const TASKS_FILE = path.join(__dirname, '../../data/tasks.json');
const LOG_FILE   = path.join(__dirname, '../../logs/tasks.log');

// Garantir diretórios
[path.dirname(TASKS_FILE), path.dirname(LOG_FILE)].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function load() {
  try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')); }
  catch(e) { return []; }
}

function save(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function logTask(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch(e) {}
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function listTasks({ status } = {}) {
  const tasks = load();
  if (status) return tasks.filter(t => t.status === status);
  return tasks.sort((a, b) => a.priority - b.priority || new Date(a.created) - new Date(b.created));
}

function createTask({ title, description = '', priority = 3 }) {
  if (!title) throw new Error('Título é obrigatório');
  const tasks = load();
  const task = {
    id:          uuidv4(),
    title,
    description,
    priority:    parseInt(priority) || 3, // 1=crítica, 2=alta, 3=média, 4=baixa
    status:      'pending',
    created:     new Date().toISOString(),
    completed:   null,
    notes:       '',
  };
  tasks.push(task);
  save(tasks);
  logTask(`CRIADA: [P${task.priority}] ${title}`);
  logger.info(`[TASKS] Nova tarefa criada: ${title}`);
  return task;
}

function updateTask(id, updates) {
  const tasks = load();
  const idx   = tasks.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Tarefa não encontrada');
  const allowed = ['title','description','priority','status','notes'];
  allowed.forEach(k => { if (updates[k] !== undefined) tasks[idx][k] = updates[k]; });
  save(tasks);
  logTask(`ATUALIZADA: ${tasks[idx].title}`);
  return tasks[idx];
}

function completeTask(id) {
  const tasks = load();
  const idx   = tasks.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Tarefa não encontrada');
  tasks[idx].status    = 'completed';
  tasks[idx].completed = new Date().toISOString();
  save(tasks);
  logTask(`CONCLUÍDA: ${tasks[idx].title}`);
  logger.success(`[TASKS] Tarefa concluída: ${tasks[idx].title}`);
  return tasks[idx];
}

function deleteTask(id) {
  const tasks = load();
  const idx   = tasks.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Tarefa não encontrada');
  const [removed] = tasks.splice(idx, 1);
  save(tasks);
  logTask(`REMOVIDA: ${removed.title}`);
  return removed;
}

module.exports = { listTasks, createTask, updateTask, completeTask, deleteTask };
