/**
 * 件名が空の検知。件名が空、または空白だけの場合に検知する。
 */

import type { Detector } from '../types';

export const subjectEmptyDetector: Detector = {
  id: 'subject-empty',
  detect(snapshot) {
    if (snapshot.subject.trim() !== '') return [];
    return [{ detectorId: 'subject-empty', messageKey: 'detectSubjectEmpty' }];
  },
};
