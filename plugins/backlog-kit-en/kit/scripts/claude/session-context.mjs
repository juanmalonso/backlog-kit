#!/usr/bin/env node
// Hook SessionStart: si la rama es de una historia, Claude arranca con su README resumido (estado,
// criterios pendientes, preguntas, último log). Si no, con lo activo y lo que conviene tomar.
import { createPm, section } from '../lib/pm.mjs';
import { currentBranch, storyOfBranch, suggestNext } from '../lib/insights.mjs';
import { addContext, clip, projectRoot, readInput } from './common.mjs';

const input = await readInput();
const root = projectRoot(input);
if (!root) process.exit(0);
try {
  const pm = createPm(root);
  const { cfg } = pm;
  const en = cfg.language === 'en';
  const branch = currentBranch(root);
  const hit = storyOfBranch(pm, branch);
  if (hit) {
    const { s, v } = hit;
    const pending = section(s.body, cfg.sections.criteria).split('\n').filter((l) => /^\s*- \[ \]/.test(l));
    const questions = section(s.body, cfg.sections.questions).split('\n').filter((l) => /^\s*- /.test(l) && !/^\s*- …\s*$/.test(l));
    const log = section(s.body, cfg.sections.log).split('\n').filter((l) => l.startsWith('- ')).slice(-5);
    addContext(
      'SessionStart',
      clip(
        [
          en ? `backlog-kit: branch \`${branch}\` belongs to ${v.id} — ${v.title}.` : `backlog-kit: la rama \`${branch}\` es de ${v.id} — ${v.title}.`,
          `${en ? 'Status' : 'Estado'}: ${v.status} · ${en ? 'criteria' : 'criterios'} ${v.criteria.done}/${v.criteria.total} · README: ${pm.rel(s.file)}`,
          pending.length ? `${en ? 'Pending criteria' : 'Criterios pendientes'}:\n${pending.join('\n')}` : '',
          questions.length ? `${cfg.sections.questions}:\n${questions.join('\n')}` : '',
          log.length ? `${en ? 'Last log entries' : 'Último log'}:\n${log.join('\n')}` : '',
          en ? 'Read the whole README before changing code.' : 'Leé el README completo antes de tocar código.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      ),
    );
  } else {
    const views = pm.loadStories().filter((x) => x.data).map((x) => pm.view(x));
    const active = views.filter((v) => [cfg.states.inProgress, cfg.states.blocked].includes(v.status));
    const n = suggestNext(pm);
    addContext(
      'SessionStart',
      [
        en ? 'backlog-kit: no story on this branch.' : 'backlog-kit: esta rama no es de ninguna historia.',
        active.length ? `${en ? 'Active' : 'Activas'}: ${active.map((v) => `${v.id} (${v.status}, ${v.branch ?? '—'})`).join(', ')}` : '',
        n.review.length ? `${en ? 'In review' : 'En review'}: ${n.review.map((v) => v.id).join(', ')}` : '',
        n.free.length ? `${en ? 'Next' : 'Para tomar'}: ${n.free.slice(0, 3).map((v) => `${v.id} ${v.title}`).join(' · ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
} catch {
  // un hook de contexto nunca frena la sesión
}
