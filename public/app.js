const state = { tasks: [], status: 'all', priority: 'all', search: '' };

const elements = {
  list: document.querySelector('#task-list'),
  empty: document.querySelector('#empty-state'),
  dialog: document.querySelector('#task-dialog'),
  form: document.querySelector('#task-form'),
  dialogTitle: document.querySelector('#dialog-title'),
  taskId: document.querySelector('#task-id'),
  title: document.querySelector('#title'),
  description: document.querySelector('#description'),
  dueDate: document.querySelector('#due-date'),
  priority: document.querySelector('#priority'),
  error: document.querySelector('#form-error'),
  toast: document.querySelector('#toast')
};

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[char]);

function localDate(value) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function today() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function isOverdue(task) {
  return !task.completedAt && task.dueDate < today();
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Não foi possível concluir a operação.');
  }
  return response.status === 204 ? null : response.json();
}

function visibleTasks() {
  const query = state.search.toLocaleLowerCase('pt-BR');
  return state.tasks.filter(task => {
    const statusMatch = state.status === 'all' ||
      (state.status === 'done' ? Boolean(task.completedAt) : !task.completedAt);
    const priorityMatch = state.priority === 'all' || task.priority === state.priority;
    const searchMatch = !query || `${task.title} ${task.description}`.toLocaleLowerCase('pt-BR').includes(query);
    return statusMatch && priorityMatch && searchMatch;
  });
}

function render() {
  const tasks = visibleTasks();
  elements.list.innerHTML = tasks.map(task => `
    <article class="task-card ${task.completedAt ? 'done' : ''}" data-id="${task.id}">
      <button class="check-button" data-action="toggle" aria-label="${task.completedAt ? 'Reabrir' : 'Concluir'} atividade">${task.completedAt ? '✓' : ''}</button>
      <div class="task-main">
        <h3>${escapeHtml(task.title)}</h3>
        ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
        <div class="meta">
          <span class="badge priority-${task.priority}">${task.priority === 'media' ? 'média' : task.priority}</span>
          <span class="${isOverdue(task) ? 'overdue' : ''}">${isOverdue(task) ? '⚠ Atrasada · ' : 'Prazo: '}${localDate(task.dueDate)}</span>
          <span>Criada em ${localDate(task.createdAt)}</span>
          ${task.completedAt ? `<span>Concluída em ${localDate(task.completedAt)}</span>` : ''}
        </div>
      </div>
      <div class="card-actions">
        <button class="icon-button" data-action="edit" aria-label="Editar atividade" title="Editar">✎</button>
        <button class="icon-button delete" data-action="delete" aria-label="Excluir atividade" title="Excluir">×</button>
      </div>
    </article>
  `).join('');
  elements.empty.hidden = tasks.length > 0;

  document.querySelector('#pending-count').textContent = state.tasks.filter(task => !task.completedAt).length;
  document.querySelector('#overdue-count').textContent = state.tasks.filter(isOverdue).length;
  document.querySelector('#done-count').textContent = state.tasks.filter(task => task.completedAt).length;
}

function openDialog(task = null) {
  elements.form.reset();
  elements.error.textContent = '';
  elements.taskId.value = task?.id || '';
  elements.dialogTitle.textContent = task ? 'Editar atividade' : 'Nova atividade';
  elements.title.value = task?.title || '';
  elements.description.value = task?.description || '';
  elements.dueDate.value = task?.dueDate || today();
  elements.priority.value = task?.priority || 'media';
  elements.dialog.showModal();
  elements.title.focus();
}

function closeDialog() {
  elements.dialog.close();
}

let toastTimer;
function toast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2400);
}

async function loadTasks() {
  try {
    state.tasks = await api('/api/tasks');
    render();
  } catch (error) {
    toast(error.message);
  }
}

document.querySelector('#new-task-button').addEventListener('click', () => openDialog());
document.querySelector('#empty-new-button').addEventListener('click', () => openDialog());
document.querySelector('#close-dialog').addEventListener('click', closeDialog);
document.querySelector('#cancel-dialog').addEventListener('click', closeDialog);
elements.dialog.addEventListener('click', event => {
  if (event.target === elements.dialog) closeDialog();
});

document.querySelector('#status-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-status]');
  if (!button) return;
  state.status = button.dataset.status;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  render();
});

document.querySelector('#priority-filter').addEventListener('change', event => {
  state.priority = event.target.value;
  render();
});

document.querySelector('#search').addEventListener('input', event => {
  state.search = event.target.value.trim();
  render();
});

elements.form.addEventListener('submit', async event => {
  event.preventDefault();
  const id = elements.taskId.value;
  const body = JSON.stringify({
    title: elements.title.value,
    description: elements.description.value,
    dueDate: elements.dueDate.value,
    priority: elements.priority.value
  });
  try {
    await api(id ? `/api/tasks/${id}` : '/api/tasks', { method: id ? 'PUT' : 'POST', body });
    closeDialog();
    await loadTasks();
    toast(id ? 'Atividade atualizada.' : 'Atividade criada.');
  } catch (error) {
    elements.error.textContent = error.message;
  }
});

elements.list.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const id = Number(button.closest('.task-card').dataset.id);
  const task = state.tasks.find(item => item.id === id);
  if (!task) return;

  if (button.dataset.action === 'edit') return openDialog(task);
  if (button.dataset.action === 'delete' && !confirm(`Excluir a atividade “${task.title}”?`)) return;

  try {
    if (button.dataset.action === 'toggle') {
      await api(`/api/tasks/${id}/toggle`, { method: 'PATCH' });
      toast(task.completedAt ? 'Atividade reaberta.' : 'Atividade concluída!');
    } else if (button.dataset.action === 'delete') {
      await api(`/api/tasks/${id}`, { method: 'DELETE' });
      toast('Atividade excluída.');
    }
    await loadTasks();
  } catch (error) {
    toast(error.message);
  }
});

loadTasks();
