import { describe, expect, it } from 'vitest';
import { findFixtureProblems } from '../../scripts/lib/fixture-files.mjs';

// コミットされる Gmail のフィクスチャに、匿名化されていないものが混ざらないようにする見張り。
// tests/fixtures/gmail/ 直下の .html をすべて検査する（raw/ は .gitignore 済みで、ここでは見ない）。
// フィクスチャが1件も無い間は、何も検査せずに通る。

describe('tests/fixtures/gmail のフィクスチャ', () => {
  it('ファイル名が決まりに合い、すべて匿名化済みである（置き換え漏れがない）', () => {
    expect(findFixtureProblems()).toEqual([]);
  });
});
