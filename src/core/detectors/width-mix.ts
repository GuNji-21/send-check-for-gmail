/**
 * 全角・半角の英数字の混在の検知。
 *
 * 件名と本文（引用部分を除く）で、ひと続きの英数字の中に全角と半角が混ざっているものを検知する
 * （例：2026年1０月、ＡBC、１2個）。
 *
 * 文面のどこかに全角があり、別の場所に半角がある、というだけでは検知しない。
 * 署名や URL には半角の英数字が必ず入るため、それを検知すると警告が出すぎる。
 */

import type { Detector } from '../types';

/** 表示する件数の上限 */
const MAX_SHOWN = 5;

/** ひと続きの英数字（全角・半角） */
const ALPHANUMERIC_RUN = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]+/gu;

const HALF = /[0-9A-Za-z]/u;
const FULL = /[０-９Ａ-Ｚａ-ｚ]/u;

function findMixedRuns(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(ALPHANUMERIC_RUN)) {
    if (HALF.test(match[0]) && FULL.test(match[0])) found.push(match[0]);
  }
  return found;
}

export const widthMixDetector: Detector = {
  id: 'width-mix',
  detect(snapshot) {
    const all = [...findMixedRuns(snapshot.subject), ...findMixedRuns(snapshot.bodyText)];
    const unique = [...new Set(all)];
    if (unique.length === 0) return [];
    return [
      {
        detectorId: 'width-mix',
        messageKey: 'detectWidthMix',
        substitutions: [unique.slice(0, MAX_SHOWN).join('、')],
      },
    ];
  },
};
