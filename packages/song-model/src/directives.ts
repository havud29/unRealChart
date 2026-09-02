import type { Directive } from './types.js';

/**
 * Repeat directives live in free text, not in a structured field, and the
 * corpus spells them inconsistently — `D.C. al 2nd End.` and
 * `<D.C. al 2nd ending>` both occur. Parsing is therefore deliberately lenient
 * about case, spacing and the End./ending suffix.
 */

const ORDINALS: Readonly<Record<string, number>> = {
  '1st': 1,
  '2nd': 2,
  '3rd': 3,
  '4th': 4,
};

export function parseDirectives(comments: readonly string[]): Directive[] {
  const directives: Directive[] = [];

  for (const raw of comments) {
    const text = raw.trim();

    const jump = /^D\.?\s*([CS])\.?\s*(?:al\s+(.*))?$/i.exec(text);
    if (jump) {
      const type = jump[1]!.toUpperCase() === 'C' ? 'dc' : 'ds';
      const rest = (jump[2] ?? '').trim().toLowerCase();

      if (/^coda/.test(rest)) {
        directives.push({ type, target: 'coda' });
      } else if (/^fine/.test(rest)) {
        directives.push({ type, target: 'fine' });
      } else {
        const ordinal = /^(\d(?:st|nd|rd|th))\s*(?:end\.?|ending)?/.exec(rest);
        if (ordinal) {
          directives.push({ type, target: 'ending', ending: ORDINALS[ordinal[1]!] ?? 1 });
        } else {
          directives.push({ type, target: 'start' });
        }
      }
      continue;
    }

    if (/^fine\.?$/i.test(text)) {
      directives.push({ type: 'fine' });
      continue;
    }

    // Play-count multipliers: `3x` through `8x`.
    const times = /^(\d+)\s*x$/i.exec(text);
    if (times) {
      const count = Number(times[1]);
      if (count >= 2 && count <= 16) directives.push({ type: 'times', count });
      continue;
    }
  }

  return directives;
}

export function findDirective<T extends Directive['type']>(
  directives: readonly Directive[],
  type: T,
): Extract<Directive, { type: T }> | undefined {
  return directives.find((d) => d.type === type) as Extract<Directive, { type: T }> | undefined;
}
