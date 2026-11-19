/**
 * 確認ダイアログのスタイル。Shadow DOM の中だけに適用され、Gmail の画面には影響しない。
 */

export const DIALOG_CSS = `
:host {
  all: initial;
}
dialog {
  box-sizing: border-box;
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  margin: auto;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: #fff;
  color: #1f1f1f;
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
dialog[open] {
  display: flex;
  flex-direction: column;
}
dialog:not([open]) {
  display: none;
}
dialog::backdrop {
  background: rgba(0, 0, 0, 0.45);
}
/* showModal が使えない環境向け（画面の中央に重ねて表示する） */
dialog.fallback {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
}
header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid #e0e0e0;
}
h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.from {
  margin-top: 4px;
  color: #5f6368;
  font-size: 12px;
  overflow-wrap: anywhere;
}
main {
  padding: 4px 20px 12px;
  overflow-y: auto;
}
section {
  margin-top: 14px;
}
h2 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #444746;
}
h3 {
  margin: 8px 0 2px;
  font-size: 12px;
  font-weight: 600;
  color: #5f6368;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  margin: 2px 0;
}
label.item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
}
label.item:hover {
  background: #f6f8fc;
}
label.item input {
  margin: 3px 0 0;
  flex: none;
  width: 16px;
  height: 16px;
}
label.item .text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
label.item .sub {
  display: block;
  color: #5f6368;
  font-size: 12px;
}
label.item.external {
  border-color: #f29900;
  background: #fff8e6;
}
label.item.caution {
  border-color: #d93025;
  background: #fdecea;
}
.badge {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
}
.badge.internal {
  background: #e8f0fe;
  color: #174ea6;
}
.badge.external {
  background: #f29900;
  color: #fff;
}
.badge.caution {
  background: #d93025;
  color: #fff;
}
.summary {
  margin: 0 0 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #fff8e6;
  color: #7a4f01;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.plain {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f1f3f4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.muted {
  color: #5f6368;
}
.detection {
  margin: 4px 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #f29900;
  background: #fff8e6;
}
.detection .head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.detection .message {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.linkbutton {
  margin: 4px 0 0;
  padding: 2px 0;
  border: none;
  background: none;
  color: #0b57d0;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}
footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #e0e0e0;
}
.remaining {
  flex: 1;
  min-width: 0;
  color: #b3261e;
  font-size: 12px;
}
button.action {
  padding: 8px 18px;
  border-radius: 999px;
  border: 1px solid #747775;
  background: #fff;
  color: #0b57d0;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button.action.primary {
  border-color: #0b57d0;
  background: #0b57d0;
  color: #fff;
}
button.action:disabled {
  border-color: #e0e0e0;
  background: #e0e0e0;
  color: #9aa0a6;
  cursor: not-allowed;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid #0b57d0;
  outline-offset: 2px;
}
.error {
  margin: 0;
  font-weight: 600;
  color: #b3261e;
}
.notice {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  max-width: 360px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #b3261e;
  color: #fff;
  font: 13px/1.5 system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}
.notice button {
  margin-left: 8px;
  border: 1px solid #fff;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
`;
