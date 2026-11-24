/**
 * 敬称の誤りの検知。
 *
 * 本文（引用部分を除く）から、次のものを検知する。
 * - 「各位」に敬称を重ねたもの（各位様、各位殿、各位御中）
 * - 同じ行で「御中」と「様」を併用したもの（例：株式会社サンプル御中 山田様）
 * - 宛名に敬称がないもの
 *
 * 「宛名に敬称がない」は、正しい文面を誤って検知しないよう、対象を絞っている。
 * - 本文の最初の行が会社名（株式会社 など）を含む短い行で、文になっていないときだけ、宛名とみなす
 *   （「株式会社サンプルの山田です。」のような名乗りは、宛名とみなさない）
 * - 宛名のかたまり（最初の空行まで。最大3行）のどこにも、敬称や役職が無いときだけ検知する
 */

import { COMPANY_MARKER } from '../text/company';
import type { Detection, Detector } from '../types';

/** 「各位」に重ねた敬称 */
const KAKUI_PATTERN = /各位[ 　]*(?:様|さま|殿|御中)/u;

/** 同じ行での「御中」と「様」の併用 */
const ONCHU_SAMA_PATTERNS: readonly RegExp[] = [
  /御中[^\n]{0,30}?(?:様|さま)/u,
  /(?:様|さま)[ 　]*御中/u,
];

/** 敬称・役職（これらがあれば、宛名に敬称があるとみなす） */
const HONORIFIC =
  /様|さま|御中|殿|さん|各位|先生|社長|会長|専務|常務|取締役|部長|次長|課長|係長|主任|店長|所長|室長|支店長|代表|マネージャー|リーダー|Dear|Mr\.|Ms\.|Mrs\./iu;

/** 宛名とみなす行の最大文字数 */
const MAX_SALUTATION_LENGTH = 40;

/** 宛名のかたまりとして見る最大行数 */
const MAX_SALUTATION_LINES = 3;

/** 文になっている行（宛名ではない）の終わり方 */
const SENTENCE_END = /[。．.！？!?]$|です$|ます$|ました$|でした$|ません$|ください$/u;

/** 本文の最初のかたまり（先頭の空行を除き、次の空行まで）の行 */
function firstBlock(bodyText: string): string[] {
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim());
  while (lines.length > 0 && lines[0] === '') lines.shift();
  const end = lines.indexOf('');
  return (end === -1 ? lines : lines.slice(0, end)).slice(0, MAX_SALUTATION_LINES);
}

/** 敬称のない宛名があれば、その最初の行を返す */
function salutationWithoutHonorific(bodyText: string): string | undefined {
  const block = firstBlock(bodyText);
  const first = block[0];
  if (first === undefined) return undefined;
  if (first.length > MAX_SALUTATION_LENGTH) return undefined;
  if (!COMPANY_MARKER.test(first)) return undefined;
  // かたまりのどこかが文になっていれば、宛名ではなく書き出しとみなす
  if (block.some((line) => SENTENCE_END.test(line))) return undefined;
  if (block.some((line) => HONORIFIC.test(line))) return undefined;
  return first;
}

export const honorificDetector: Detector = {
  id: 'honorific',
  detect(snapshot) {
    const body = snapshot.bodyText;
    const results: Detection[] = [];

    const kakui = KAKUI_PATTERN.exec(body);
    if (kakui !== null) {
      results.push({
        detectorId: 'honorific',
        messageKey: 'detectHonorificKakui',
        substitutions: [kakui[0].replace(/[ 　]+/gu, '')],
      });
    }

    for (const pattern of ONCHU_SAMA_PATTERNS) {
      const match = pattern.exec(body);
      if (match === null) continue;
      results.push({
        detectorId: 'honorific',
        messageKey: 'detectHonorificOnchuSama',
        substitutions: [match[0]],
      });
      break;
    }

    const salutation = salutationWithoutHonorific(body);
    if (salutation !== undefined) {
      results.push({
        detectorId: 'honorific',
        messageKey: 'detectHonorificMissing',
        substitutions: [salutation],
      });
    }
    return results;
  },
};
