/**
 * 宛先検索（作成画面のボタンと検索パネル）のスタイル。Shadow DOM の中だけに適用され、Gmail の画面には影響しない。
 *
 * 見た目は確認ダイアログ（src/ui/dialog/styles.ts）に合わせる。
 * - パネルは、背後を弱くぼかした暗いアクリル。文字は白。
 * - メールアドレス・ドメインは、似た文字を見分けやすい等幅の書体にする。
 * - 外部からフォントを読み込むことはしない（端末に入っている書体だけを使う）。
 */

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
  --ink-soft: rgba(255, 255, 255, 0.86);
  --rule: rgba(255, 255, 255, 0.16);
  --wash: rgba(255, 255, 255, 0.08);
  --external: #f9f1a5;
  --ui: "BIZ UDPGothic", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;
  --data: "Cascadia Mono", Consolas, "SF Mono", Menlo, "BIZ UDGothic", monospace;

  position: fixed;
  z-index: 2147483000;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background-color: rgba(13, 17, 23, 0.35);
  -webkit-backdrop-filter: blur(12px) saturate(1.8) brightness(0.62);
  backdrop-filter: blur(12px) saturate(1.8) brightness(0.62);
  color: var(--ink);
  color-scheme: dark;
  font: 13px/1.6 var(--ui);
  font-feature-settings: "palt";
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 24px 56px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 8px 16px;
}
h2 {
  flex: 1;
  margin: 0;
  font: 700 14px/1.4 var(--ui);
}
button {
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font: 12px/1 var(--ui);
  white-space: nowrap;
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: var(--wash);
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}
button:disabled {
  border-color: var(--rule);
  color: var(--ink-soft);
  cursor: default;
}
.close {
  padding: 6px 10px;
}
.query {
  box-sizing: border-box;
  margin: 0 16px;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.25);
  color: var(--ink);
  font: 14px/1.4 var(--ui);
}
.query::placeholder {
  color: rgba(255, 255, 255, 0.6);
}
.status {
  margin: 0;
  padding: 8px 16px 0;
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
  margin-top: 8px;
  padding: 0 16px 12px;
  overflow-y: auto;
}
.company {
  padding: 8px 0 4px;
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
  gap: 8px;
  padding: 6px 0;
}
.who {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.add {
  min-width: 44px;
  padding: 7px 8px;
}
.more {
  margin: 4px 0 0;
  color: var(--ink-soft);
}
`;
