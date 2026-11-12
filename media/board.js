// Tablero kanban del webview. No escribe nada: pide a la extensión que mueva una tarjeta y repinta
// con lo que la extensión le manda después (el README es la fuente de verdad).
(function () {
  const vscode = acquireVsCodeApi();
  const saved = vscode.getState() || {};
  const ui = { epic: saved.epic || '', priority: saved.priority || '', q: saved.q || '', hideClosed: saved.hideClosed ?? true };
  let data = null;
  let dragging = null;

  const TEXT = {
    es: {
      search: 'Buscar', allEpics: 'Todas las épicas', allPriorities: 'Todas las prioridades', hideClosed: 'Ocultar cerradas',
      refresh: 'Actualizar', move: 'Mover', empty: 'Sin historias', current: 'Tu rama', criteria: 'criterios',
      deps: 'Depende de', noStories: 'Todavía no hay historias en .pm/. Creá una con /hu-nueva.', invalid: 'No se puede mover de',
      to: 'a', stories: (n) => `${n} historia${n === 1 ? '' : 's'}`,
    },
    en: {
      search: 'Search', allEpics: 'All epics', allPriorities: 'All priorities', hideClosed: 'Hide closed',
      refresh: 'Refresh', move: 'Move', empty: 'No stories', current: 'Your branch', criteria: 'criteria',
      deps: 'Depends on', noStories: 'No stories in .pm/ yet. Create one with /story-new.', invalid: 'Cannot move from',
      to: 'to', stories: (n) => `${n} stor${n === 1 ? 'y' : 'ies'}`,
    },
  };
  const t = () => TEXT[data?.language] || TEXT.es;
  const save = () => vscode.setState(ui);
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) n.append(c);
    return n;
  };

  function toolbar() {
    const bar = document.getElementById('toolbar');
    bar.replaceChildren();
    const T = t();
    const search = el('input', { type: 'search', placeholder: T.search, 'aria-label': T.search, value: ui.q });
    search.addEventListener('input', () => {
      ui.q = search.value;
      save();
      render();
    });
    const select = (value, label, options, key) => {
      const s = el('select', { 'aria-label': label }, el('option', { value: '' }, label), options.map(([v, l]) => el('option', { value: v, selected: v === value }, l)));
      s.addEventListener('change', () => {
        ui[key] = s.value;
        save();
        render();
      });
      return s;
    };
    const closed = el('input', { type: 'checkbox', id: 'hideClosed', checked: ui.hideClosed });
    closed.addEventListener('change', () => {
      ui.hideClosed = closed.checked;
      save();
      render();
    });
    bar.append(
      search,
      select(ui.epic, T.allEpics, data.epics.map((e) => [e.id, `${e.id} · ${e.title}`]), 'epic'),
      select(ui.priority, T.allPriorities, data.priorities.map((p) => [p, p]), 'priority'),
      el('label', { class: 'check', for: 'hideClosed' }, closed, T.hideClosed),
      el('span', { class: 'count', id: 'count' }),
      el('button', { class: 'ghost', onclick: () => vscode.postMessage({ type: 'refresh' }) }, T.refresh),
    );
  }

  function visible(s) {
    if (ui.epic && s.epic !== ui.epic) return false;
    if (ui.priority && s.priority !== ui.priority) return false;
    if (ui.q) {
      const q = ui.q.toLowerCase();
      if (![s.id, s.title, s.branch, s.epicTitle, s.type].some((x) => x && String(x).toLowerCase().includes(q))) return false;
    }
    return true;
  }

  function card(s) {
    const T = t();
    const prioIndex = data.priorities.indexOf(s.priority);
    const mine = data.branch && s.branch === data.branch;
    const meta = [
      el('span', { class: 'chip epic', title: s.epicTitle }, s.epic),
      s.type && el('span', { class: 'chip' }, s.type),
      s.estimate && el('span', { class: 'chip' }, s.estimate),
      ...data.fields.filter((f) => !f.list && s.extra[f.key] != null).map((f) => el('span', { class: 'chip', title: f.label }, `${f.label} ${s.extra[f.key]}`)),
    ];
    const foot = [
      s.criteria.total ? el('span', { class: 'criteria', title: T.criteria }, `☑ ${s.criteria.done}/${s.criteria.total}`) : null,
      s.issue && data.repoUrl
        ? el('a', { href: '#', class: 'issue', onclick: (e) => { e.preventDefault(); e.stopPropagation(); vscode.postMessage({ type: 'link', url: `${data.repoUrl}/issues/${s.issue}` }); } }, `#${s.issue}`)
        : s.issue && el('span', { class: 'issue' }, `#${s.issue}`),
      mine && el('span', { class: 'mine' }, `⎇ ${T.current}`),
      el('button', { class: 'ghost small', 'aria-label': `${T.move} ${s.id}`, onclick: (e) => { e.stopPropagation(); vscode.postMessage({ type: 'pick', id: s.id, from: s.status }); } }, `${T.move}…`),
    ];
    const node = el(
      'article',
      {
        class: `card prio-${prioIndex < 0 ? 'x' : prioIndex}${mine ? ' current' : ''}${s.error ? ' broken' : ''}`,
        draggable: 'true',
        tabindex: '0',
        role: 'button',
        'aria-label': `${s.id} ${s.title}, ${s.status}${s.priority ? `, ${s.priority}` : ''}`,
        title: s.dependencies.length ? `${T.deps}: ${s.dependencies.join(', ')}` : '',
        onclick: () => vscode.postMessage({ type: 'open', path: s.path }),
        onkeydown: (e) => {
          if (e.key === 'Enter') vscode.postMessage({ type: 'open', path: s.path });
          if (e.key === 'm' || e.key === 'M') vscode.postMessage({ type: 'pick', id: s.id, from: s.status });
        },
        ondragstart: (e) => {
          dragging = s;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', s.id);
          document.body.classList.add('dragging');
          for (const col of document.querySelectorAll('.column')) {
            const ok = (data.transitions[s.status] || []).includes(col.dataset.state);
            col.classList.toggle('allowed', ok);
          }
        },
        ondragend: () => {
          dragging = null;
          document.body.classList.remove('dragging');
          for (const col of document.querySelectorAll('.column')) col.classList.remove('allowed', 'over');
        },
      },
      el('div', { class: 'card-head' }, el('span', { class: 'id' }, s.id), s.priority && el('span', { class: 'prio' }, s.priority)),
      el('div', { class: 'title' }, s.error ? `⚠ ${s.error}` : s.title),
      el('div', { class: 'meta' }, meta),
      el('div', { class: 'foot' }, foot),
    );
    return node;
  }

  function render() {
    const board = document.getElementById('board');
    if (!data) return;
    const T = t();
    const closedRoles = ['done', 'discarded'];
    const states = data.states.filter((s) => !(ui.hideClosed && closedRoles.includes(s.role)));
    const shown = data.stories.filter(visible);
    document.getElementById('count').textContent = T.stories(shown.length);
    if (!data.stories.length) {
      board.replaceChildren(el('p', { class: 'empty-board' }, T.noStories));
      return;
    }
    board.style.setProperty('--cols', states.length);
    board.replaceChildren(
      ...states.map((st) => {
        const list = shown.filter((s) => s.status === st.name).sort((a, b) => data.priorities.indexOf(a.priority) - data.priorities.indexOf(b.priority) || a.id.localeCompare(b.id));
        return el(
          'section',
          {
            class: `column role-${st.role}`,
            'data-state': st.name,
            'aria-label': `${st.name} (${list.length})`,
            ondragover: (e) => {
              if (!dragging) return;
              if ((data.transitions[dragging.status] || []).includes(st.name)) {
                e.preventDefault();
                e.currentTarget.classList.add('over');
              }
            },
            ondragleave: (e) => e.currentTarget.classList.remove('over'),
            ondrop: (e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('over');
              const s = dragging;
              if (!s || s.status === st.name) return;
              vscode.postMessage({ type: 'move', id: s.id, from: s.status, to: st.name });
            },
          },
          el('h2', {}, el('span', {}, st.name.replace(/_/g, ' ')), el('span', { class: 'n' }, String(list.length))),
          el('div', { class: 'cards' }, list.length ? list.map(card) : el('p', { class: 'empty' }, T.empty)),
        );
      }),
    );
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'data') {
      const first = !data;
      data = m.data;
      if (first || !document.getElementById('count')) toolbar();
      render();
    }
    if (m.type === 'error') document.getElementById('board').replaceChildren(el('p', { class: 'empty-board error' }, m.message));
  });
  vscode.postMessage({ type: 'ready' });
})();
