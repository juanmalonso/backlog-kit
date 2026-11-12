// Tablero del webview: kanban (con agrupación), vista de dependencias y panel de detalle. No escribe
// nada: pide a la extensión que corra los scripts del proyecto y repinta con lo que le manda
// después (el README es la fuente de verdad).
(function () {
  const vscode = acquireVsCodeApi();
  const saved = vscode.getState() || {};
  const ui = {
    epic: saved.epic || '',
    priority: saved.priority || '',
    q: saved.q || '',
    hideClosed: saved.hideClosed ?? true,
    view: saved.view || 'board',
    group: saved.group || '',
    selected: saved.selected || null,
  };
  let data = null;
  let detail = null;
  let dragging = null;

  const TEXT = {
    es: {
      search: 'Buscar', allEpics: 'Todas las épicas', allPriorities: 'Todas las prioridades', hideClosed: 'Ocultar cerradas',
      refresh: 'Actualizar', move: 'Mover', empty: 'Sin historias', current: 'Tu rama', criteria: 'criterios',
      noStories: 'Todavía no hay historias en .pm/. Creá una con "+ Nueva" o con /hu-nueva.',
      stories: (n) => `${n} historia${n === 1 ? '' : 's'}`, board: 'Tablero', deps: 'Dependencias', newStory: '+ Nueva',
      groupNone: 'Sin agrupar', groupEpic: 'Por épica', groupStage: (l) => `Por ${l.toLowerCase()}`, noGroup: 'Sin valor',
      waits: (ids) => `Espera ${ids}`, unlocks: (n) => `Destraba ${n}`, blocked: 'Bloqueada',
      ci: { pass: 'CI en verde', fail: 'CI en rojo', pending: 'CI corriendo', none: 'Sin checks' }, draft: 'borrador',
      close: 'Cerrar', story: 'Historia', log: 'Log', dependsOn: 'Depende de', dependents: 'La esperan',
      actions: { move: 'Mover…', log: 'Loguear…', start: 'Empezar (rama)', pr: 'Abrir PR', open: 'Abrir README', issue: 'Issue', prLink: 'PR' },
      questions: 'Preguntas pendientes', none: '—', depsEmpty: 'Ninguna historia tiene dependencias todavía.',
      depsHint: 'Más grande = destraba más historias. Clic para ver el detalle.',
    },
    en: {
      search: 'Search', allEpics: 'All epics', allPriorities: 'All priorities', hideClosed: 'Hide closed',
      refresh: 'Refresh', move: 'Move', empty: 'No stories', current: 'Your branch', criteria: 'criteria',
      noStories: 'No stories in .pm/ yet. Create one with "+ New" or /story-new.',
      stories: (n) => `${n} stor${n === 1 ? 'y' : 'ies'}`, board: 'Board', deps: 'Dependencies', newStory: '+ New',
      groupNone: 'No grouping', groupEpic: 'By epic', groupStage: (l) => `By ${l.toLowerCase()}`, noGroup: 'No value',
      waits: (ids) => `Waits for ${ids}`, unlocks: (n) => `Unblocks ${n}`, blocked: 'Blocked',
      ci: { pass: 'CI green', fail: 'CI red', pending: 'CI running', none: 'No checks' }, draft: 'draft',
      close: 'Close', story: 'Story', log: 'Log', dependsOn: 'Depends on', dependents: 'Waiting on it',
      actions: { move: 'Move…', log: 'Log…', start: 'Start (branch)', pr: 'Open PR', open: 'Open README', issue: 'Issue', prLink: 'PR' },
      questions: 'Open questions', none: '—', depsEmpty: 'No story has dependencies yet.',
      depsHint: 'Bigger = unblocks more stories. Click for details.',
    },
  };
  const t = () => TEXT[data?.language] || TEXT.es;
  const save = () => vscode.setState(ui);
  const post = (m) => vscode.postMessage(m);
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
  const svg = (tag, attrs = {}, ...children) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) n.append(c);
    return n;
  };
  // append y replaceChildren escriben "null" o "false" como texto: se filtran antes.
  const kids = (...xs) => xs.flat().filter((x) => x != null && x !== false && x !== '');
  const byId = (id) => data.stories.find((s) => s.id === id);
  const stageField = () => data.fields.find((f) => f.range);
  const roleOf = (status) => data.states.find((s) => s.name === status)?.role;

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
    const select = (value, label, options, key, withEmpty = true) => {
      const s = el(
        'select',
        { 'aria-label': label },
        withEmpty && el('option', { value: '' }, label),
        options.map(([v, l]) => el('option', { value: v, selected: v === value }, l)),
      );
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
    const tab = (v, label) =>
      el('button', { class: `tab${ui.view === v ? ' on' : ''}`, 'aria-pressed': String(ui.view === v), onclick: () => { ui.view = v; save(); toolbar(); render(); } }, label);
    const sf = stageField();
    bar.append(
      ...kids(el('div', { class: 'tabs', role: 'group' }, tab('board', T.board), tab('deps', T.deps)),
      search,
      select(ui.epic, T.allEpics, data.epics.map((e) => [e.id, `${e.id} · ${e.title}`]), 'epic'),
      select(ui.priority, T.allPriorities, data.priorities.map((p) => [p, p]), 'priority'),
      ui.view === 'board' &&
        select(ui.group, T.groupNone, [['', T.groupNone], ['epic', T.groupEpic], ...(sf ? [['stage', T.groupStage(sf.label)]] : [])], 'group', false),
      el('label', { class: 'check', for: 'hideClosed' }, closed, T.hideClosed),
      el('span', { class: 'count', id: 'count' }),
      el('button', { onclick: () => post({ type: 'new' }) }, T.newStory),
      el('button', { class: 'ghost', onclick: () => post({ type: 'refresh' }) }, T.refresh)),
    );
  }

  function visible(s) {
    if (ui.hideClosed && ['done', 'discarded'].includes(roleOf(s.status))) return false;
    if (ui.epic && s.epic !== ui.epic) return false;
    if (ui.priority && s.priority !== ui.priority) return false;
    if (ui.q) {
      const q = ui.q.toLowerCase();
      if (![s.id, s.title, s.branch, s.epicTitle, s.type].some((x) => x && String(x).toLowerCase().includes(q))) return false;
    }
    return true;
  }

  function badges(s) {
    const T = t();
    const out = [];
    if (s.pr)
      out.push(
        el(
          'a',
          { href: '#', class: `pr ci-${s.pr.ci}`, title: `${T.ci[s.pr.ci]}${s.pr.draft ? ` · ${T.draft}` : ''}`, onclick: (e) => { e.preventDefault(); e.stopPropagation(); post({ type: 'link', url: s.pr.url }); } },
          el('span', { class: 'dot', 'aria-hidden': 'true' }),
          `PR #${s.pr.number}`,
        ),
      );
    const role = roleOf(s.status);
    if (s.pendingDeps.length && !['done', 'discarded'].includes(role)) out.push(el('span', { class: 'warn', title: T.waits(s.pendingDeps.join(', ')) }, `⧗ ${T.waits(s.pendingDeps.join(', '))}`));
    if (s.unlocks && ['ready', 'refining', 'backlog', 'inProgress'].includes(role)) out.push(el('span', { class: 'unlocks' }, `↗ ${T.unlocks(s.unlocks)}`));
    return out;
  }

  function card(s) {
    const T = t();
    const prioIndex = data.priorities.indexOf(s.priority);
    const mine = data.branch && s.branch === data.branch;
    const node = el(
      'article',
      {
        class: `card prio-${prioIndex < 0 ? 'x' : prioIndex}${mine ? ' current' : ''}${s.error ? ' broken' : ''}${ui.selected === s.id ? ' selected' : ''}`,
        draggable: 'true',
        tabindex: '0',
        role: 'button',
        'aria-label': `${s.id} ${s.title}, ${s.status}${s.priority ? `, ${s.priority}` : ''}`,
        onclick: () => select(s.id),
        onkeydown: (e) => {
          if (e.key === 'Enter') select(s.id);
          if (e.key === 'o' || e.key === 'O') post({ type: 'open', path: s.path });
          if (e.key === 'm' || e.key === 'M') post({ type: 'pick', id: s.id, from: s.status });
        },
        ondragstart: (e) => {
          dragging = s;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', s.id);
          document.body.classList.add('dragging');
          for (const col of document.querySelectorAll('.column')) col.classList.toggle('allowed', (data.transitions[s.status] || []).includes(col.dataset.state));
        },
        ondragend: () => {
          dragging = null;
          document.body.classList.remove('dragging');
          for (const col of document.querySelectorAll('.column')) col.classList.remove('allowed', 'over');
        },
      },
      el('div', { class: 'card-head' }, el('span', { class: 'id' }, s.id), s.priority && el('span', { class: 'prio' }, s.priority)),
      el('div', { class: 'title' }, s.error ? `⚠ ${s.error}` : s.title),
      s.blockedReason && el('div', { class: 'reason' }, `⛔ ${s.blockedReason}`),
      el(
        'div',
        { class: 'meta' },
        el('span', { class: 'chip epic', title: s.epicTitle }, s.epic),
        s.type && el('span', { class: 'chip' }, s.type),
        s.estimate && el('span', { class: 'chip' }, s.estimate),
        data.fields.filter((f) => !f.list && s.extra[f.key] != null).map((f) => el('span', { class: 'chip', title: f.label }, `${f.label} ${s.extra[f.key]}`)),
      ),
      el(
        'div',
        { class: 'foot' },
        s.criteria.total ? el('span', { class: 'criteria', title: T.criteria }, `☑ ${s.criteria.done}/${s.criteria.total}`) : null,
        s.issue && data.repoUrl
          ? el('a', { href: '#', class: 'issue', onclick: (e) => { e.preventDefault(); e.stopPropagation(); post({ type: 'link', url: `${data.repoUrl}/issues/${s.issue}` }); } }, `#${s.issue}`)
          : s.issue && el('span', { class: 'issue' }, `#${s.issue}`),
        badges(s),
        mine && el('span', { class: 'mine' }, `⎇ ${T.current}`),
      ),
    );
    return node;
  }

  function columns(states, list) {
    return states.map((st) => {
      const items = list
        .filter((s) => s.status === st.name)
        .sort((a, b) => data.priorities.indexOf(a.priority) - data.priorities.indexOf(b.priority) || a.id.localeCompare(b.id));
      return el(
        'section',
        {
          class: `column role-${st.role}`,
          'data-state': st.name,
          'aria-label': `${st.name} (${items.length})`,
          ondragover: (e) => {
            if (dragging && (data.transitions[dragging.status] || []).includes(st.name)) {
              e.preventDefault();
              e.currentTarget.classList.add('over');
            }
          },
          ondragleave: (e) => e.currentTarget.classList.remove('over'),
          ondrop: (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('over');
            const s = dragging;
            if (s && s.status !== st.name) post({ type: 'move', id: s.id, from: s.status, to: st.name });
          },
        },
        el('h2', {}, el('span', {}, st.name.replace(/_/g, ' ')), el('span', { class: 'n' }, String(items.length))),
        el('div', { class: 'cards' }, items.length ? items.map(card) : el('p', { class: 'empty' }, t().empty)),
      );
    });
  }

  function renderBoard(main, shown) {
    const states = data.states.filter((s) => !(ui.hideClosed && ['done', 'discarded'].includes(s.role)));
    main.className = 'board-wrap';
    if (!ui.group) {
      const grid = el('div', { class: 'board' }, columns(states, shown));
      grid.style.setProperty('--cols', states.length);
      main.replaceChildren(grid);
      return;
    }
    const T = t();
    const sf = stageField();
    const keyOf = (s) => (ui.group === 'epic' ? s.epic : (s.extra[sf.key] ?? null));
    const lanes = ui.group === 'epic' ? data.epics.map((e) => [e.id, `${e.id} · ${e.title}`]) : [...Array(sf.range[1] - sf.range[0] + 1)].map((_, i) => [sf.range[0] + i, `${sf.label} ${sf.range[0] + i}`]);
    lanes.push([null, T.noGroup]);
    main.replaceChildren(
      ...lanes
        .map(([key, label]) => [label, shown.filter((s) => keyOf(s) === key)])
        .filter(([, list]) => list.length)
        .map(([label, list]) => {
          const grid = el('div', { class: 'board lane-grid' }, columns(states, list));
          grid.style.setProperty('--cols', states.length);
          return el('section', { class: 'lane', 'aria-label': label }, el('h3', { class: 'lane-title' }, label, el('span', { class: 'n' }, String(list.length))), grid);
        }),
    );
  }

  // Vista de dependencias: capas por profundidad (lo que no depende de nada, a la izquierda).
  function renderDeps(main, shown) {
    main.className = 'deps-wrap';
    const T = t();
    const ids = new Set(shown.map((s) => s.id));
    const nodes = shown.filter((s) => s.dependencies.some((d) => ids.has(d)) || s.dependents.some((d) => ids.has(d)));
    if (!nodes.length) {
      main.replaceChildren(el('p', { class: 'empty-board' }, T.depsEmpty));
      return;
    }
    const depth = new Map();
    const level = (s, seen = new Set()) => {
      if (depth.has(s.id)) return depth.get(s.id);
      if (seen.has(s.id)) return 0;
      seen.add(s.id);
      const parents = s.dependencies.map(byId).filter((p) => p && ids.has(p.id));
      const d = parents.length ? 1 + Math.max(...parents.map((p) => level(p, seen))) : 0;
      depth.set(s.id, d);
      return d;
    };
    nodes.forEach((s) => level(s));
    const layers = [];
    for (const s of nodes) (layers[depth.get(s.id)] ||= []).push(s);
    layers.forEach((l) => l.sort((a, b) => b.unlocks - a.unlocks || a.id.localeCompare(b.id)));
    const W = 170;
    const H = 58;
    const GX = 70;
    const GY = 18;
    const pos = new Map();
    layers.forEach((l, x) => l.forEach((s, y) => pos.set(s.id, { x: 20 + x * (W + GX), y: 20 + y * (H + GY) })));
    const width = 40 + layers.length * (W + GX);
    const height = 40 + Math.max(...layers.map((l) => l.length)) * (H + GY);
    const edges = [];
    for (const s of nodes)
      for (const d of s.dependencies) {
        if (!pos.has(d)) continue;
        const a = pos.get(d);
        const b = pos.get(s.id);
        const pending = s.pendingDeps.includes(d);
        edges.push(svg('path', { d: `M${a.x + W},${a.y + H / 2} C${a.x + W + GX / 2},${a.y + H / 2} ${b.x - GX / 2},${b.y + H / 2} ${b.x},${b.y + H / 2}`, class: `edge${pending ? ' pending' : ''}`, 'marker-end': 'url(#arrow)' }));
      }
    const maxUnlocks = Math.max(1, ...nodes.map((s) => s.unlocks));
    const boxes = nodes.map((s) => {
      const p = pos.get(s.id);
      const weight = 1 + Math.round((s.unlocks / maxUnlocks) * 3);
      return svg(
        'g',
        { class: `node role-${roleOf(s.status)}${ui.selected === s.id ? ' selected' : ''}`, transform: `translate(${p.x},${p.y})`, tabindex: '0', role: 'button', 'aria-label': `${s.id} ${s.title}, ${s.status}`, onclick: () => select(s.id), onkeydown: (e) => e.key === 'Enter' && select(s.id) },
        svg('rect', { width: W, height: H, rx: 6, 'stroke-width': weight }),
        svg('text', { x: 10, y: 20, class: 'nid' }, `${s.id}${s.unlocks ? `  ↗${s.unlocks}` : ''}`),
        svg('text', { x: 10, y: 37, class: 'ntitle' }, s.title.length > 24 ? `${s.title.slice(0, 23)}…` : s.title),
        svg('text', { x: 10, y: 51, class: 'nstate' }, s.status),
      );
    });
    main.replaceChildren(
      el('p', { class: 'hint' }, T.depsHint),
      svg(
        'svg',
        { width, height, viewBox: `0 0 ${width} ${height}`, class: 'graph', role: 'img', 'aria-label': T.deps },
        svg('defs', {}, svg('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrowhead' }))),
        edges,
        boxes,
      ),
    );
  }

  function select(id) {
    ui.selected = id;
    save();
    detail = null;
    post({ type: 'detail', id });
    render();
  }

  function renderDetail() {
    const aside = document.getElementById('detail');
    const s = ui.selected && data && byId(ui.selected);
    if (!s) {
      aside.hidden = true;
      document.body.classList.remove('with-detail');
      return;
    }
    const T = t();
    aside.hidden = false;
    document.body.classList.add('with-detail');
    const link = (id) => el('a', { href: '#', onclick: (e) => { e.preventDefault(); select(id); } }, id);
    const list = (ids) => (ids.length ? ids.flatMap((id, i) => [i ? ', ' : '', link(id)]) : T.none);
    const d = detail && detail.id === s.id ? detail : null;
    const role = roleOf(s.status);
    // Solo las preguntas reales: los ítems que no son el "…" de la plantilla.
    const questions = d ? d.questions.split('\n').filter((l) => /^\s*- /.test(l) && !/^\s*- …\s*$/.test(l)).join('\n') : '';
    aside.replaceChildren(
      ...kids(el('div', { class: 'detail-head' }, el('span', { class: 'id' }, s.id), el('button', { class: 'ghost small', 'aria-label': T.close, onclick: () => { ui.selected = null; save(); renderDetail(); } }, '✕')),
      el('h2', {}, s.title),
      el('div', { class: 'meta' }, el('span', { class: 'chip state' }, s.status), s.priority && el('span', { class: 'chip' }, s.priority), el('span', { class: 'chip epic' }, `${s.epic} · ${s.epicTitle}`), badges(s)),
      s.blockedReason && el('p', { class: 'reason' }, `⛔ ${s.blockedReason}`),
      el(
        'div',
        { class: 'actions' },
        el('button', { onclick: () => post({ type: 'pick', id: s.id, from: s.status }) }, T.actions.move),
        el('button', { class: 'ghost', onclick: () => post({ type: 'log', id: s.id }) }, T.actions.log),
        ['ready', 'inProgress'].includes(role) && el('button', { class: 'ghost', onclick: () => post({ type: 'start', id: s.id }) }, T.actions.start),
        data.github && role === 'review' && !s.pr && el('button', { class: 'ghost', onclick: () => post({ type: 'pr', id: s.id }) }, T.actions.pr),
        el('button', { class: 'ghost', onclick: () => post({ type: 'open', path: s.path }) }, T.actions.open),
        s.issue && data.repoUrl && el('button', { class: 'ghost', onclick: () => post({ type: 'link', url: `${data.repoUrl}/issues/${s.issue}` }) }, `${T.actions.issue} #${s.issue}`),
        s.pr && el('button', { class: 'ghost', onclick: () => post({ type: 'link', url: s.pr.url }) }, `${T.actions.prLink} #${s.pr.number}`),
      ),
      el('dl', {}, el('dt', {}, T.dependsOn), el('dd', {}, list(s.dependencies)), el('dt', {}, T.dependents), el('dd', {}, list(s.dependents))),
      d && d.story && el('section', {}, el('h3', {}, T.story), el('p', { class: 'prose' }, d.story.replace(/\*\*/g, ''))),
      d &&
        el(
          'section',
          {},
          el('h3', {}, `${d.criteriaTitle} (${s.criteria.done}/${s.criteria.total})`),
          d.criteria.length
            ? el(
                'ul',
                { class: 'criteria-list' },
                d.criteria.map((c) => {
                  const box = el('input', { type: 'checkbox', id: `c${c.index}`, checked: c.checked });
                  box.addEventListener('change', () => post({ type: 'toggle', id: s.id, index: c.index, checked: box.checked }));
                  return el('li', { class: c.nested ? 'nested' : '' }, box, el('label', { for: `c${c.index}` }, c.text));
                }),
              )
            : el('p', { class: 'empty' }, T.none),
        ),
      questions && el('section', {}, el('h3', {}, T.questions), el('p', { class: 'prose' }, questions)),
      d && el('section', {}, el('h3', {}, T.log), el('ul', { class: 'log' }, d.log.map((l) => el('li', {}, l))))),
    );
  }

  function render() {
    const main = document.getElementById('board');
    if (!data) return;
    const T = t();
    const shown = data.stories.filter(visible);
    document.getElementById('count').textContent = T.stories(shown.length);
    if (!data.stories.length) {
      main.className = 'board-wrap';
      main.replaceChildren(el('p', { class: 'empty-board' }, T.noStories));
    } else if (ui.view === 'deps') renderDeps(main, shown);
    else renderBoard(main, shown);
    renderDetail();
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'data') {
      const first = !data;
      data = m.data;
      if (first || !document.getElementById('count')) toolbar();
      render();
      if (first && ui.selected) post({ type: 'detail', id: ui.selected });
    }
    if (m.type === 'detail') {
      detail = m.detail;
      renderDetail();
    }
    if (m.type === 'select') select(m.id);
    if (m.type === 'error') document.getElementById('board').replaceChildren(el('p', { class: 'empty-board error' }, m.message));
  });
  post({ type: 'ready' });
})();
