/**
 * 未記入のプレースホルダーの検知。
 *
 * 件名と本文（引用部分を除く）に、テンプレートの書き換え忘れと思われる記号が残っている場合に検知する。
 * 対象：〇〇、●●、△△、□□、■■（同じ記号が2つ以上続く）、XX（英大文字の X が2つ以上、単語の一部は除く）、
 *       【 】（中身が空の括弧）、{name}・{{name}}（波括弧で囲んだ名前）
 */

import type { Detector } from '../types';

/** 表示する件数の上限 */
const MAX_SHOWN = 5;

const PATTERNS: readonly RegExp[] = [
  // 丸・三角・四角の記号が2つ以上続く（〇 は漢数字のゼロ、○ ◯ は丸記号）
  /[〇○◯]{2,}/gu,
  /●{2,}/gu,
  /[△▲]{2,}/gu,
  /[□■]{2,}/gu,
  // X が2つ以上（XXL や MAXX のような単語の一部は除く）。全角の Ｘ も対象
  /(?<![A-Za-z0-9Ａ-Ｚａ-ｚ０-９])[XＸ]{2,}(?![A-Za-z0-9Ａ-Ｚａ-ｚ０-９])/gu,
  // 中身が空（空白だけ）の括弧
  /【[\s　]*】/gu,
  // {name}、{{name}}、｛名前｝
  /\{\{?[^{}\n]{1,30}\}?\}/gu,
  /｛[^｛｝\n]{1,30}｝/gu,
];

function findPlaceholders(text: string): string[] {
  const found: { index: number; value: string }[] = [];
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.push({ index: match.index, value: match[0] });
    }
  }
  return found.sort((a, b) => a.index - b.index).map((item) => item.value);
}

export const placeholderDetector: Detector = {
  id: 'placeholder',
  detect(snapshot) {
    const all = [...findPlaceholders(snapshot.subject), ...findPlaceholders(snapshot.bodyText)];
    const unique = [...new Set(all)];
    if (unique.length === 0) return [];
    return [
      {
        detectorId: 'placeholder',
        messageKey: 'detectPlaceholder',
        substitutions: [unique.slice(0, MAX_SHOWN).join('、')],
      },
    ];
  },
};
