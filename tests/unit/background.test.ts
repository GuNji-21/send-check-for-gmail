import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** background を読み込み、登録された onInstalled の処理を返す */
async function loadBackground() {
  const listeners: ((details: { reason: string }) => void)[] = [];
  const openOptionsPage = vi.fn(() => Promise.resolve());
  vi.stubGlobal('chrome', {
    runtime: {
      onInstalled: {
        addListener: (listener: (details: { reason: string }) => void) => listeners.push(listener),
      },
      openOptionsPage,
    },
  });
  await import('../../src/background/service-worker');
  const onInstalled = listeners[0];
  if (onInstalled === undefined) throw new Error('onInstalled listener was not registered');
  return { onInstalled, openOptionsPage };
}

describe('background', () => {
  it('新規インストールのときは、再読み込みの案内がある設定画面を開く', async () => {
    const { onInstalled, openOptionsPage } = await loadBackground();
    onInstalled({ reason: 'install' });
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('更新のときは設定画面を開かない', async () => {
    const { onInstalled, openOptionsPage } = await loadBackground();
    onInstalled({ reason: 'update' });
    onInstalled({ reason: 'chrome_update' });
    expect(openOptionsPage).not.toHaveBeenCalled();
  });

  it('設定画面を開けなくても、例外を外に出さない', async () => {
    const { onInstalled, openOptionsPage } = await loadBackground();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openOptionsPage.mockRejectedValueOnce(new Error('no window'));
    onInstalled({ reason: 'install' });
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalled();
  });
});
