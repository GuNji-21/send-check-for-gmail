/**
 * 確認ダイアログのスタイル。Shadow DOM の中だけに適用され、Gmail の画面には影響しない。
 *
 * 見た目の決まり：
 * - 素材はアクリル（すりガラス）。背後の Gmail を弱めにぼかして透かし、その上に #0D1117 を透明度 65%（不透明度 35%）で重ねる。
 *   ぼかしは、背後にあるものの形がうっすら分かる程度にとどめる（強くぼかすと、ただの灰色の板に見えるため）。
 *   ページ全体は暗くしない。白い文字が読めるように、パネルの中だけ背後を少し暗くしている。
 * - 文字は、業務文書向けに作られた BIZ UDP ゴシックを使う（Windows に標準で入っている）。
 *   メールアドレス・ドメイン・ファイル名は、似た文字（l と 1、O と 0）を見分けやすい等幅の書体にする。
 *   外部からフォントを読み込むことはしない（外部通信をしない決まりのため、端末に入っている書体だけを使う）。
 * - 色は白を基調にし、意味を持つ色は2つだけにする。黄色は「社外・警告」、赤は「要注意」。
 * - 枠で囲んだ部品を並べず、行と細い区切り線で見せる。角は小さく丸める。
 */

export const DIALOG_CSS = `
:host {
  all: initial;
}
dialog {
  --tint: rgba(13, 17, 23, 0.35);
  --ink: #ffffff;
  --ink-soft: rgba(255, 255, 255, 0.86);
  --rule: rgba(255, 255, 255, 0.16);
  --wash: rgba(255, 255, 255, 0.08);
  --external: #f9f1a5;
  --caution: #c50f1f;
  --ui: "BIZ UDPGothic", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;
  --data: "Cascadia Mono", Consolas, "SF Mono", Menlo, "BIZ UDGothic", monospace;

  box-sizing: border-box;
  width: min(620px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  margin: auto;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background-color: var(--tint);
  /* アクリルの粒状感（ごく弱いノイズ） */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E");
  -webkit-backdrop-filter: blur(12px) saturate(1.8) brightness(0.62);
  backdrop-filter: blur(12px) saturate(1.8) brightness(0.62);
  color: var(--ink);
  color-scheme: dark;
  font: 14px/1.6 var(--ui);
  font-feature-settings: "palt";
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 24px 56px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
dialog[open] {
  display: flex;
  flex-direction: column;
  animation: arrive 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
dialog:not([open]) {
  display: none;
}
/* ページ全体は暗くしない（背後の Gmail はそのまま見せる）。操作できないことだけ、ごく薄く示す */
dialog::backdrop {
  background: rgba(13, 17, 23, 0.1);
}
@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.985);
  }
}
@media (prefers-reduced-motion: reduce) {
  dialog[open] {
    animation: none;
  }
}
/* showModal が使えない環境向け（画面の中央に重ねて表示する） */
dialog.fallback {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
}
::selection {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
}

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 22px 12px;
  border-bottom: 1px solid var(--rule);
}
h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.from {
  min-width: 0;
  color: var(--ink-soft);
  font: 12px/1.6 var(--data);
  overflow-wrap: anywhere;
  text-align: right;
}
main {
  padding: 0 22px 6px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.4) transparent;
}

/* 見出しを左の列、内容を右の列に置く（件名・本文・添付・宛先を上から順に読めるようにする） */
section {
  display: grid;
  grid-template-columns: 5.5em minmax(0, 1fr);
  column-gap: 14px;
  padding: 12px 0;
  border-top: 1px solid var(--rule);
}
section:first-child {
  border-top: none;
}
section > * {
  grid-column: 2;
}
section > h2 {
  grid-column: 1;
  grid-row: 1 / span 20;
  margin: 0;
  padding-top: 1px;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 400;
}
/* 警告は、見出しを上に置いて横幅いっぱいに使う */
section.warnings,
section.typos,
section.failure {
  display: block;
}
section.typos > h2 {
  margin-bottom: 6px;
}
section.warnings > h2 {
  margin-bottom: 6px;
  color: var(--external);
  font-weight: 700;
}
h3 {
  margin: 8px 0 0;
  color: var(--ink-soft);
  font: 12px/1.6 var(--data);
  font-weight: 400;
}
h3:first-of-type {
  margin-top: 0;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
p {
  margin: 0;
}

/* 警告 */
.detection {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0;
}
.icon {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 3px;
}
.icon-shape {
  fill: var(--external);
}
.icon-mark {
  fill: none;
  stroke: #0d1117;
  stroke-width: 1.5;
  stroke-linecap: round;
}
.detection .message {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* AI による誤字・脱字の候補（誤りの箇所 → 修正案、その下に理由） */
.typo {
  padding: 3px 0;
}
.change {
  font: 13px/1.7 var(--data);
  overflow-wrap: anywhere;
}
.wrong {
  text-decoration: line-through;
  text-decoration-color: var(--external);
  text-decoration-thickness: 2px;
}
.arrow {
  margin: 0 8px;
  color: var(--ink-soft);
}
.suggestion {
  font-weight: 700;
}
.reason {
  display: block;
  color: var(--ink-soft);
  font-size: 12px;
}
.typo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 12px;
  align-items: start;
  padding: 5px 0;
}
.typo .reason {
  grid-column: 1;
}
.typo-actions {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  gap: 6px;
}
button.mini {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease-out;
}
button.mini:hover {
  background: var(--wash);
}
/* 修正の結果（修正後の行、修正できなかった理由）は、候補の下に横幅いっぱいで出す */
.typo-detail {
  grid-column: 1 / -1;
}
.typo-detail:empty {
  display: none;
}
.fix-result {
  margin-top: 4px;
  color: var(--ink-soft);
  font-size: 12px;
}
.typo.unapplied .fix-result {
  color: var(--external);
}
.fixed-line {
  margin-top: 2px;
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--wash);
  font: 13px/1.7 var(--data);
  overflow-wrap: anywhere;
}
.fixed-label {
  margin-right: 4px;
  color: var(--ink-soft);
  font: 12px/1.7 var(--ui);
}
/* 書き換えた部分 */
mark {
  padding: 1px 3px;
  border-radius: 2px;
  background: rgba(249, 241, 165, 0.3);
  color: var(--ink);
  font-weight: 700;
}
/* 修正済みの候補は、文字を引かせる */
.typo.applied .change,
.typo.applied .reason {
  color: var(--ink-soft);
}

/* 宛先・添付（チェックする行） */
.summary {
  margin-bottom: 6px;
  color: var(--external);
  font-size: 12px;
  overflow-wrap: anywhere;
}
label.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 -8px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
}
label.item:hover {
  background: var(--wash);
}
label.item input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 3px 0 0;
  accent-color: #ffffff;
  cursor: pointer;
}
label.item .text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.address,
.file {
  font: 13px/1.7 var(--data);
}
label.item .sub {
  display: block;
  color: var(--ink-soft);
  font: 12px/1.5 var(--ui);
}
/* チェック済みの行は、文字を少し引かせて「残り」を目立たせる */
label.item:has(input:checked) .text {
  color: var(--ink-soft);
}
.tag {
  flex: none;
  font-size: 12px;
  line-height: 1.9;
  white-space: nowrap;
}
.tag.internal {
  color: var(--ink-soft);
}
.tag.external {
  color: var(--external);
  font-weight: 700;
}
/* 要注意だけは塗りで強く示す（この画面でいちばん見落としてはいけない印） */
.tag.caution {
  padding: 0 8px;
  border-radius: 3px;
  background: var(--caution);
  color: #fff;
  font-weight: 700;
}
label.item.caution {
  background: rgba(197, 15, 31, 0.28);
}
label.item.caution:hover {
  background: rgba(197, 15, 31, 0.4);
}
.linkbutton {
  justify-self: start;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

/* 件名・本文 */
.plain {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.muted {
  color: var(--ink-soft);
}

footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 22px;
  border-top: 1px solid var(--rule);
}
.remaining {
  flex: 1;
  min-width: 0;
  color: var(--external);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
button.action {
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 120ms ease-out;
}
button.action:hover {
  background: var(--wash);
}
/* 主となる操作は白の塗り。色ではなく明るさで目立たせる */
button.action.primary {
  min-width: 96px;
  border-color: #ffffff;
  background: #ffffff;
  color: #0d1117;
}
button.action.primary:hover {
  background: rgba(255, 255, 255, 0.86);
}
button.action.primary:disabled {
  border-color: transparent;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.45);
  cursor: not-allowed;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

/* 「チェックできませんでした」 */
.error {
  font-size: 15px;
  font-weight: 700;
}
.failure .muted {
  margin-top: 6px;
}

/* 画面の隅の注意書き */
.notice {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 380px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background-color: rgba(13, 17, 23, 0.35);
  -webkit-backdrop-filter: blur(12px) saturate(1.8) brightness(0.62);
  backdrop-filter: blur(12px) saturate(1.8) brightness(0.62);
  color: #ffffff;
  color-scheme: dark;
  font: 13px/1.6 "BIZ UDPGothic", "Hiragino Sans", "Yu Gothic UI", Meiryo, sans-serif;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), 0 16px 40px rgba(0, 0, 0, 0.4);
}
.notice button {
  flex: none;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 4px;
  background: transparent;
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}
`;
