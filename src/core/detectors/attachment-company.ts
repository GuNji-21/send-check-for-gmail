/**
 * 添付ファイル名と宛先の不一致の検知。
 *
 * 添付ファイルの名前に、台帳に登録されている会社名（別名を含む）のうち、
 * 今回の宛先の会社ではないものが入っている場合に検知する
 * （例：「見積書_サンプル商事.pdf」を、別の会社に送ろうとしている）。
 * 照合の決まりは、本文中の他社名の検知（other-company-in-body.ts）と同じ。
 */

import type { Detector } from '../types';
import { findOtherCompanies } from './other-company-in-body';

/** 表示する件数の上限 */
const MAX_SHOWN = 3;

export const attachmentCompanyDetector: Detector = {
  id: 'attachment-company',
  detect(snapshot, context) {
    return snapshot.attachments.flatMap((attachment) => {
      const found = findOtherCompanies(attachment.fileName, snapshot, context);
      if (found.length === 0) return [];
      return [
        {
          detectorId: 'attachment-company' as const,
          messageKey: 'detectAttachmentCompany' as const,
          substitutions: [attachment.fileName, found.slice(0, MAX_SHOWN).join('、')],
        },
      ];
    });
  },
};
