/**
 * 社名表記の検知（宛先の会社名の書き方が、台帳の登録と違う）。
 *
 * 宛先の会社名が台帳に「株式会社サンプル」のように登録されているとき、
 * 件名・本文（引用部分を除く）に、次の書き方があれば検知する。
 * - 前株・後株の誤り（サンプル株式会社）
 * - 略した書き方（（株）サンプル、サンプル（株）、㈱サンプル）
 *
 * 対象は、登録した会社名が「株式会社」「有限会社」「合同会社」で始まるか終わるものだけ。
 * 空白と、全角・半角の違いは無視する。台帳の情報が無いときは、何も検知しない。
 */

import { searchKey } from '../text/company';
import { normalizeAddress } from '../text/address';
import type { Detector } from '../types';

/** 会社の種類と、その略した書き方（NFKC で半角にそろえた形。㈱ は NFKC で (株) になる） */
const TYPES: readonly { readonly word: string; readonly short: string }[] = [
  { word: '株式会社', short: '(株)' },
  { word: '有限会社', short: '(有)' },
  { word: '合同会社', short: '(同)' },
];

/** 「株式会社」などを除いた部分の、最小の文字数（短すぎる名前は、別の言葉に一致しやすいので対象外） */
const MIN_CORE_LENGTH = 2;

/** 表示する件数の上限 */
const MAX_SHOWN = 3;

/** 登録した会社名から、誤った書き方の候補（照合用の形と、表示用の形）を作る */
function wrongForms(name: string): { readonly key: string; readonly shown: string }[] {
  const trimmed = name.trim();
  for (const type of TYPES) {
    const isPrefix = trimmed.startsWith(type.word);
    const isSuffix = trimmed.endsWith(type.word);
    if (isPrefix === isSuffix) continue;
    const core = (
      isPrefix ? trimmed.slice(type.word.length) : trimmed.slice(0, -type.word.length)
    ).trim();
    const coreKey = searchKey(core);
    if (Array.from(coreKey).length < MIN_CORE_LENGTH) return [];
    const forms = [
      // 前株・後株の誤り
      isPrefix
        ? { key: coreKey + type.word, shown: core + type.word }
        : { key: type.word + coreKey, shown: type.word + core },
      // 略した書き方
      { key: type.short + coreKey, shown: `${type.short}${core}` },
      { key: coreKey + type.short, shown: `${core}${type.short}` },
    ];
    return forms;
  }
  return [];
}

export const companyNotationDetector: Detector = {
  id: 'company-notation',
  detect(snapshot, context) {
    const { ledger } = context;
    if (ledger?.recipientCompanyNames === undefined) return [];
    const textKey = searchKey(`${snapshot.subject}\n${snapshot.bodyText}`);
    const found: { wrong: string; registered: string }[] = [];
    const seen = new Set<string>();
    for (const recipient of snapshot.recipients) {
      // 照合するのは、登録した会社名（1つ目）だけ。別名は、表記ゆれとして登録されたものなので対象にしない
      const name = ledger.recipientCompanyNames[normalizeAddress(recipient.address)]?.[0];
      if (name === undefined || seen.has(name)) continue;
      seen.add(name);
      const correctKey = searchKey(name);
      // 正しい書き方を取り除いてから探す（「株式会社サンプル株式会社」のような並びで誤って一致しないように）
      const rest = textKey.split(correctKey).join('\n');
      const wrong = wrongForms(name).find((form) => rest.includes(form.key));
      if (wrong !== undefined) found.push({ wrong: wrong.shown, registered: name });
    }
    return found.slice(0, MAX_SHOWN).map((item) => ({
      detectorId: 'company-notation' as const,
      messageKey: 'detectCompanyNotation' as const,
      substitutions: [item.wrong, item.registered],
    }));
  },
};
