/**
 * 本文が空の検知。
 *
 * 本文（引用部分を除く）に、空白と改行のほかに何も書かれていない場合に検知する。
 * 転送や返信で、自分の文を何も書いていない場合も検知する（警告だけで、そのまま送信できる）。
 */

import type { Detector } from '../types';

export const bodyEmptyDetector: Detector = {
  id: 'body-empty',
  detect(snapshot) {
    if (snapshot.bodyText.trim() !== '') return [];
    return [{ detectorId: 'body-empty', messageKey: 'detectBodyEmpty' }];
  },
};
