/**
 * 枠を回る光の帯（確認ダイアログと宛先検索のパネルで共通に使う飾り）。
 *
 * 枠に沿った細い線と、その内側のやわらかい光の2層でできている。色は、帯の尾から頭に向かって変わる。
 * 入れ物の側で、次の2つを用意して使う。
 * - position（fixed・absolute・relative のどれか）と overflow: hidden、border-radius
 * - 帯の色（--beam。下の BEAM_* のどれか）。入れ物の状態に合わせて切り替えられる
 *
 * 飾りなので、操作は受け取らず（pointer-events: none）、読み上げにも出さない（aria-hidden）。
 * 動きを減らす設定（prefers-reduced-motion）の環境では、回さずに止めて表示する。
 * 画像や外部のファイルは使わない（CSS のグラデーションだけで描く）。
 */

/** 帯の長さは、1周の約 36%。両端は透明にして、真ん中をいちばん明るくする */
function comet(colors: readonly string[]): string {
  const start = 64;
  const step = (100 - start) / (colors.length + 1);
  const stops = colors.map((color, index) => `${color} ${String(start + step * (index + 1))}%`);
  return `conic-gradient(transparent 0 ${String(start)}%, ${stops.join(', ')}, transparent 100%)`;
}

/** 色とりどり（確認が残っている間） */
export const BEAM_COLORFUL = comet(['#40d973', '#3399f2', '#b359f2', '#ff59a6', '#ffa640']);
/** 緑から水色（確認が済んで、送信できる状態） */
export const BEAM_READY = comet(['#4dffb3', '#40d973', '#33ccff']);
/** 黄色から赤（チェックできなかったとき） */
export const BEAM_ALERT = comet(['#ffc74d', '#ff804d', '#ff4d73']);

export const BEAM_CSS = `
.beam {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}
.beam-glow,
.beam-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
/* 内側のやわらかい光：太めの輪をぼかす */
.beam-glow {
  opacity: 0.55;
  filter: blur(12px);
}
/* 枠の形の輪だけを残す（輪の太さは padding で決める） */
.beam-ring {
  padding: 1.5px;
  overflow: hidden;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
}
.beam-glow > .beam-ring {
  padding: 7px;
}
/* 入れ物より大きい正方形を、中心で回す */
.beam-comet {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2000px;
  height: 2000px;
  margin: -1000px 0 0 -1000px;
  background: var(--beam);
  animation: beam-orbit var(--beam-duration, 4.2s) linear infinite;
}
@keyframes beam-orbit {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .beam-comet {
    animation: none;
    transform: rotate(54deg);
  }
}
`;

/** 光の帯の要素を作る。入れ物の最初の子として入れる */
export function createBeam(doc: Document): HTMLElement {
  const div = (className: string): HTMLElement => {
    const element = doc.createElement('div');
    element.className = className;
    return element;
  };
  const ring = (): HTMLElement => {
    const element = div('beam-ring');
    element.append(div('beam-comet'));
    return element;
  };
  const beam = div('beam');
  beam.setAttribute('aria-hidden', 'true');
  const glow = div('beam-glow');
  glow.append(ring());
  beam.append(glow, ring());
  return beam;
}
