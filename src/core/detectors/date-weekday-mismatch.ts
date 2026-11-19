/**
 * 日付と曜日の不一致の検知。
 *
 * 件名と本文（引用部分を除く）から「11月13日（木）」「11/13(木)」「2026年11月13日(金曜日)」のような
 * 「日付＋括弧に入った曜日」を探し、実際の曜日と違う場合に検知する。存在しない日付（2月30日など）も検知する。
 *
 * 年が書かれていない場合は、送信操作の日時（capturedAt）にいちばん近い年の日付とみなす
 * （12月に書いた「1月10日」は翌年、1月に書いた「12月25日」は前年）。
 *
 * 対象は日本語の曜日表記のみ。英語の表記（Fri, Nov 13 など）はフェーズ1では対象外。
 */

import { toHalfWidth } from '../text/normalize';
import type { Detection, Detector } from '../types';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/**
 * 日付＋曜日の表記。全角を半角にそろえた文字列に対して使う。
 * 1 = 年（省略可）、2 = 月、3 = 日、4 = 曜日
 */
const DATE_PATTERN =
  /(?:(\d{4})\s*[年/.-]\s*)?(\d{1,2})\s*[月/]\s*(\d{1,2})\s*日?\s*\(\s*([日月火水木金土])(?:曜日?)?\s*\)/gu;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 年月日が実在する日付なら、その日の UTC 0時の時刻を返す。実在しなければ null */
function toUtcTime(year: number, month: number, day: number): number | null {
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? time
    : null;
}

/** 年が省略された月日について、基準日にいちばん近い年の日付（UTC 0時の時刻）を返す */
function nearestDate(month: number, day: number, baseTime: number): number | null {
  const baseYear = new Date(baseTime).getUTCFullYear();
  let best: number | null = null;
  for (const year of [baseYear - 1, baseYear, baseYear + 1]) {
    const time = toUtcTime(year, month, day);
    if (time === null) continue;
    if (best === null || Math.abs(time - baseTime) < Math.abs(best - baseTime)) best = time;
  }
  return best;
}

function detectIn(text: string, baseTime: number): Detection[] {
  const detections: Detection[] = [];
  for (const match of toHalfWidth(text).matchAll(DATE_PATTERN)) {
    const [written, yearText, monthText, dayText, weekday] = match;
    const month = Number(monthText);
    const day = Number(dayText);
    const time =
      yearText === undefined
        ? nearestDate(month, day, baseTime)
        : toUtcTime(Number(yearText), month, day);

    if (time === null) {
      detections.push({
        detectorId: 'date-weekday-mismatch',
        messageKey: 'detectDateInvalid',
        substitutions: [written.trim()],
      });
      continue;
    }
    const actual = WEEKDAYS[new Date(time).getUTCDay()];
    if (actual !== undefined && actual !== weekday) {
      detections.push({
        detectorId: 'date-weekday-mismatch',
        messageKey: 'detectDateWeekdayMismatch',
        substitutions: [written.trim(), actual],
      });
    }
  }
  return detections;
}

export const dateWeekdayMismatchDetector: Detector = {
  id: 'date-weekday-mismatch',
  detect(snapshot) {
    const captured = new Date(snapshot.capturedAt);
    if (Number.isNaN(captured.getTime())) {
      throw new Error(`Invalid capturedAt: ${snapshot.capturedAt}`);
    }
    // 利用者の暦の日付を基準にするため、capturedAt の年月日（ISO 8601 の先頭10文字）をそのまま使う
    const [y, m, d] = snapshot.capturedAt.slice(0, 10).split('-').map(Number);
    const baseTime =
      (y !== undefined && m !== undefined && d !== undefined ? toUtcTime(y, m, d) : null) ??
      Math.floor(captured.getTime() / DAY_MS) * DAY_MS;

    const detections = [
      ...detectIn(snapshot.subject, baseTime),
      ...detectIn(snapshot.bodyText, baseTime),
    ];
    // 同じ表記が何度も出てくる場合は1件にまとめる
    const seen = new Set<string>();
    return detections.filter((detection) => {
      const key = `${detection.messageKey}:${detection.substitutions?.join('|') ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
};
