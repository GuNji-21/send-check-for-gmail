/**
 * 宛先検索（作成画面のボタンと検索パネル）のスタイル。Shadow DOM の中だけに適用され、Gmail の画面には影響しない。
 *
 * 見た目は確認ダイアログ（src/ui/dialog/styles.ts）に合わせる。
 * - パネルは、つやのない暗い面。角を大きく丸め、枠に光の帯を回す（src/ui/beam.ts）。文字は白。
 * - ボタンと検索欄は、両端が丸い形（カプセル）にする。
 * - メールアドレス・ドメインは、似た文字を見分けやすい等幅の書体にする。
 * - 外部からフォントを読み込むことはしない（端末に入っている書体だけを使う）。
 */

import { BEAM_COLORFUL, BEAM_CSS } from '../beam';

/** 作成画面の下の操作列に置くボタン（Gmail の白い画面に合わせる） */
export const SEARCH_BUTTON_CSS = `
:host {
  all: initial;
  display: inline-flex;
  vertical-align: middle;
  margin-left: 8px;
}
button {
  box-sizing: border-box;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #747775;
  border-radius: 16px;
  background: #ffffff;
  color: #0b57d0;
  font: 500 13px/1 "BIZ UDPGothic", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;
  white-space: nowrap;
  cursor: pointer;
}
button:hover {
  background: #f0f4f9;
}
button:focus-visible {
  outline: 2px solid #0b57d0;
  outline-offset: 2px;
}
`;

export const SEARCH_PANEL_CSS = `
:host {
  all: initial;
}
.panel {
  --ink: #ffffff;
  --ink-soft: rgba(255, 255, 255, 0.72);
  --ink-faint: rgba(255, 255, 255, 0.5);
  --rule: rgba(255, 255, 255, 0.08);
  --wash: rgba(255, 255, 255, 0.07);
  --wash-strong: rgba(255, 255, 255, 0.13);
  --external: #f9f1a5;
  --ui: "BIZ UDPGothic", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;
  --data: "Cascadia Mono", Consolas, "SF Mono", Menlo, "BIZ UDGothic", monospace;
  --beam: ${BEAM_COLORFUL};
  --beam-duration: 5s;

  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--rule);
  border-radius: 24px;
  background-color: rgba(24, 24, 26, 0.96);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  color: var(--ink);
  color-scheme: dark;
  font: 13px/1.6 var(--ui);
  font-feature-settings: "palt";
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 24px 64px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  animation: arrive 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}
${BEAM_CSS}
/* 中身は、光の帯より手前に置く */
header,
.query,
.status,
.results {
  position: relative;
  z-index: 1;
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 14px 10px 20px;
}
h2 {
  flex: 1;
  margin: 0;
  font: 700 14px/1.4 var(--ui);
}
button {
  box-sizing: border-box;
  border: none;
  border-radius: 999px;
  background: var(--wash-strong);
  color: var(--ink);
  font: 700 12px/1 var(--ui);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease-out;
}
button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
button:disabled {
  background: transparent;
  color: var(--ink-faint);
  cursor: default;
}
.close {
  padding: 7px 12px;
}
.query {
  box-sizing: border-box;
  margin: 0 16px;
  padding: 9px 16px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  background: var(--wash);
  color: var(--ink);
  font: 14px/1.4 var(--ui);
}
.query::placeholder {
  color: var(--ink-faint);
}
.status {
  margin: 0;
  padding: 10px 20px 0;
  color: var(--ink-soft);
}
.status:empty {
  display: none;
}
.status.error {
  color: var(--external);
}
.results {
  flex: 1;
  min-height: 0;
  margin-top: 10px;
  padding: 0 20px 14px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
}
.results:empty {
  margin-top: 0;
  padding-bottom: 16px;
}
.company {
  padding: 10px 0 4px;
  border-top: 1px solid var(--rule);
}
h3 {
  margin: 0;
  font: 700 13px/1.5 var(--ui);
  overflow-wrap: anywhere;
}
.data {
  font: 12px/1.5 var(--data);
  overflow-wrap: anywhere;
}
.soft {
  color: var(--ink-soft);
}
.person {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
}
.who {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.add {
  min-width: 44px;
  padding: 8px 12px;
}
.more {
  margin: 4px 0 0;
  color: var(--ink-soft);
}
`;
