import './style.css';
import { PERSONAS, JOB_ORDER } from './personas.js';
import { streamChat } from './gemini.js';
import { renderMarkdown } from './markdown.js';

const KEY_STORAGE = 'gemini-api-key';
const JOB_STORAGE = 'interview-job';

const $ = (id) => document.getElementById(id);
const app = document.querySelector('.app');
const els = {
  jobs: $('jobs'),
  messages: $('messages'),
  composer: $('composer'),
  input: $('input'),
  send: $('send-btn'),
  role: $('chat-role'),
  tagline: $('chat-tagline'),
  reset: $('reset-btn'),
  keyBtn: $('key-btn'),
  keyLabel: $('key-label'),
  keyDialog: $('key-dialog'),
  keyForm: $('key-form'),
  keyInput: $('key-input'),
  keyError: $('key-error'),
  keyForget: $('key-forget'),
};

const state = {
  job: JOB_ORDER.includes(storageGet(JOB_STORAGE)) ? storageGet(JOB_STORAGE) : JOB_ORDER[0],
  apiKey: storageGet(KEY_STORAGE) || '',
  // Each role keeps its own conversation, so switching tabs doesn't lose context.
  histories: Object.fromEntries(JOB_ORDER.map((id) => [id, []])),
  controller: null,
};

// ---------- Job selector ----------

function renderJobs() {
  els.jobs.innerHTML = '';
  for (const id of JOB_ORDER) {
    const p = PERSONAS[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'job';
    btn.setAttribute('role', 'tab');
    btn.dataset.job = id;
    btn.style.setProperty('--job-a', p.palette.a);
    btn.style.setProperty('--job-b', p.palette.b);
    btn.innerHTML = `<span class="job-short"></span><span class="job-label"></span>`;
    btn.querySelector('.job-short').textContent = p.short;
    btn.querySelector('.job-label').textContent = p.label;
    btn.addEventListener('click', () => selectJob(id));
    els.jobs.append(btn);
  }
}

function selectJob(id) {
  if (state.controller) state.controller.abort();
  state.job = id;
  storageSet(JOB_STORAGE, id);
  const p = PERSONAS[id];

  app.dataset.job = id;
  const root = document.documentElement.style;
  root.setProperty('--accent', p.palette.a);
  root.setProperty('--accent-2', p.palette.b);
  root.setProperty('--glow', p.palette.glow);

  for (const btn of els.jobs.children) {
    const active = btn.dataset.job === id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  els.role.textContent = p.label;
  els.tagline.textContent = p.tagline;
  renderMessages();
  els.input.focus();
}

// ---------- Messages ----------

function renderMessages() {
  const p = PERSONAS[state.job];
  const history = state.histories[state.job];
  els.messages.innerHTML = '';
  addBubble('model', p.greeting);

  if (history.length === 0) {
    const chips = document.createElement('div');
    chips.className = 'starters';
    for (const text of p.starters) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'starter';
      chip.textContent = text;
      chip.addEventListener('click', () => send(text));
      chips.append(chip);
    }
    els.messages.append(chips);
  }
  for (const m of history) addBubble(m.role, m.text);
  scrollToBottom();
}

function addBubble(role, text, extraClass = '') {
  const bubble = document.createElement('div');
  bubble.className = `msg ${role === 'user' ? 'msg-user' : 'msg-bot'} ${extraClass}`.trim();
  if (role === 'user') bubble.textContent = text;
  else bubble.innerHTML = renderMarkdown(text);
  els.messages.append(bubble);
  return bubble;
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

// ---------- Sending ----------

async function send(text) {
  text = text.trim();
  if (!text || state.controller) return;
  if (!state.apiKey) {
    openKeyDialog();
    return;
  }

  const job = state.job;
  const history = state.histories[job];
  history.push({ role: 'user', text });
  els.messages.querySelector('.starters')?.remove();
  addBubble('user', text);
  els.input.value = '';
  autosize();

  const bubble = addBubble('model', '', 'typing');
  bubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
  scrollToBottom();

  const controller = new AbortController();
  state.controller = controller;
  setBusy(true);
  let reply = '';

  try {
    reply = await streamChat({
      apiKey: state.apiKey,
      system: PERSONAS[job].system,
      history,
      signal: controller.signal,
      onChunk: (chunk) => {
        reply += chunk;
        bubble.classList.remove('typing');
        bubble.innerHTML = renderMarkdown(reply);
        scrollToBottom();
      },
    });
    history.push({ role: 'model', text: reply });
  } catch (err) {
    if (err.name === 'AbortError') {
      // Switched roles mid-reply: keep whatever arrived so the conversation stays coherent.
      if (reply) history.push({ role: 'model', text: reply });
      else history.pop();
    } else {
      history.pop();
      bubble.classList.remove('typing');
      bubble.classList.add('msg-error');
      bubble.textContent = err.message;
      if (/api key/i.test(err.message)) openKeyDialog(err.message);
    }
  } finally {
    if (state.controller === controller) state.controller = null;
    setBusy(false);
  }
}

function setBusy(busy) {
  els.send.disabled = busy;
  els.composer.classList.toggle('busy', busy);
}

function autosize() {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
}

els.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  send(els.input.value);
});
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(els.input.value);
  }
});
els.input.addEventListener('input', autosize);
els.reset.addEventListener('click', () => {
  if (state.controller) state.controller.abort();
  state.histories[state.job] = [];
  renderMessages();
});

// ---------- API key ----------

function openKeyDialog(error = '') {
  els.keyInput.value = state.apiKey;
  els.keyError.hidden = !error;
  els.keyError.textContent = error;
  els.keyForget.hidden = !state.apiKey;
  if (!els.keyDialog.open) els.keyDialog.showModal();
  els.keyInput.focus();
}

function updateKeyBadge() {
  els.keyBtn.classList.toggle('connected', Boolean(state.apiKey));
  els.keyLabel.textContent = state.apiKey ? 'Gemini connected' : 'Add API key';
}

els.keyForm.addEventListener('submit', (e) => {
  const key = els.keyInput.value.trim();
  if (!key) {
    e.preventDefault();
    return;
  }
  state.apiKey = key;
  storageSet(KEY_STORAGE, key);
  updateKeyBadge();
});
els.keyForget.addEventListener('click', () => {
  state.apiKey = '';
  storageSet(KEY_STORAGE, '');
  updateKeyBadge();
  openKeyDialog();
});
// Without a key the app can't do anything, so the dialog can't be dismissed with Esc.
els.keyDialog.addEventListener('cancel', (e) => {
  if (!state.apiKey) e.preventDefault();
});
els.keyBtn.addEventListener('click', () => openKeyDialog());

// ---------- Storage helpers ----------

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode); the key just won't persist.
  }
}

// ---------- Boot ----------

renderJobs();
selectJob(state.job);
updateKeyBadge();
if (!state.apiKey) openKeyDialog();
