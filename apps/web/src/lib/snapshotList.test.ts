import { describe, it, expect } from 'vitest';
import { addSnapshot, removeSnapshot, toggleCompare, pruneSelection, MAX_SNAPSHOTS } from './snapshotList';
import { SHORTCUTS, findShortcut } from './shortcuts';

const s = (id: string) => ({ id });

describe('snapshot list', () => {
  it('puts the newest first', () => {
    const { list } = addSnapshot([s('a')], s('b'));
    expect(list.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('evicts the oldest beyond the cap and reports it', () => {
    let list: { id: string }[] = [];
    let evicted: { id: string }[] = [];
    for (let i = 0; i < MAX_SNAPSHOTS + 2; i++) {
      ({ list, evicted } = addSnapshot(list, s(`s${i}`)));
    }
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0].id).toBe(`s${MAX_SNAPSHOTS + 1}`);
    expect(evicted.map((x) => x.id)).toEqual(['s1']); // the final add pushed out the then-oldest
  });

  it('does not duplicate an id', () => {
    const { list } = addSnapshot([s('a'), s('b')], s('a'));
    expect(list.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('removes and returns the removed item', () => {
    const { list, removed } = removeSnapshot([s('a'), s('b')], 'a');
    expect(list.map((x) => x.id)).toEqual(['b']);
    expect(removed?.id).toBe('a');
    expect(removeSnapshot(list, 'zzz').removed).toBeNull();
  });
});

describe('compare selection', () => {
  it('toggles on and off', () => {
    expect(toggleCompare([], 'a')).toEqual(['a']);
    expect(toggleCompare(['a'], 'a')).toEqual([]);
  });

  it('keeps at most two, dropping the oldest pick', () => {
    expect(toggleCompare(['a', 'b'], 'c')).toEqual(['b', 'c']);
  });

  it('prunes ids that no longer exist', () => {
    expect(pruneSelection(['a', 'x'], [s('a'), s('b')])).toEqual(['a']);
  });
});

describe('shortcuts', () => {
  it('has unique keys', () => {
    const keys = SHORTCUTS.map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('finds by case-insensitive key', () => {
    expect(findShortcut('G')?.label).toBe('G');
    expect(findShortcut('nope')).toBeUndefined();
  });
});
