import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';

const isNative = Capacitor.isNativePlatform();

function safeFileName(fileName) {
  const baseName = String(fileName || 'world-workshop-export').split(/[\\/]/).pop();
  return baseName.replace(/[<>:"|?*\u0000-\u001f]/g, '_') || 'world-workshop-export';
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function saveFile({ fileName, blob }) {
  const name = safeFileName(fileName);
  const encoded = await blobToBase64(blob);
  const saved = await Filesystem.writeFile({
    path: name,
    data: encoded,
    directory: Directory.Cache
  });
  await Share.share({
    title: name,
    text: '世界工坊导出文件',
    files: [saved.uri],
    dialogTitle: '保存或分享文件'
  });
}

window.WorldWorkshopNative = {
  isNative,
  saveFile
};

if (isNative) {
  void StatusBar.setOverlaysWebView({ overlay: false })
    .then(() => StatusBar.setBackgroundColor({ color: '#17211c' }))
    .catch(() => {});
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  void App.addListener('backButton', () => {
    const handled = Boolean(window.WorldWorkshopApp?.handleBack?.());
    if (!handled) void App.exitApp();
  });
}
