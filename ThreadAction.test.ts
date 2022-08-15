import ThreadAction  from './ThreadAction';
import Utils from './utils';

it('Adds parent labels', () => {
  const labels = ['list/abc', 'bot/team1/test', 'bot/team1/alert', 'def'];
  const action = new ThreadAction();
  const expected = new Set(['list', 'list/abc', 'bot', 'bot/team1', 'bot/team1/test', 'bot/team1/alert', 'def'])

  action.addLabels(labels);

  Utils.assert(action.label_names.size === expected.size,
    `Expected ${Array.from(expected).join(', ')},
but got ${Array.from(action.label_names).join(', ')}`);

  for (const label of expected) {
    Utils.assert(action.label_names.has(label), `Expected label ${label}, but not present in action.`);
  }
});

it('Does not add parent labels for empty list', () => {
  const labels: string[] = [];
  const action = new ThreadAction();

  action.addLabels(labels);

  Utils.assert(action.label_names.size === 0,
    `Expected empty set, but got ${Array.from(action.label_names).join(', ')}`);
});
