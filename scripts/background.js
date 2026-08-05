// Chess AI Master - Background Service Worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSettings') {
    chrome.storage.local.get('chess-ai-settings', (result) => {
      sendResponse(result['chess-ai-settings'] || {});
    });
    return true;
  }

  if (request.action === 'saveSettings') {
    chrome.storage.local.set({ 'chess-ai-settings': request.data }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'showNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon.png'),
      title: request.title || 'Chess AI Master',
      message: request.message || '',
      priority: 2
    });
    sendResponse({ success: true });
    return true;
  }

  sendResponse({ error: 'Unknown action' });
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon.png'),
      title: 'Chess AI Master Installed!',
      message: 'Open Chess.com to start analyzing. Use Ctrl+Shift+X to toggle the panel.',
      priority: 2
    });
  }
});

console.log('[ChessAI] Background loaded');
