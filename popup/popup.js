// Chess AI Master - Popup Script
// Handles the extension popup UI and interactions

document.addEventListener('DOMContentLoaded', async () => {
  // Load stats
  try {
    const response = await sendMessage({ action: 'getGameStats' });
    if (response) {
      document.getElementById('games-played').textContent = response.gamesPlayed || 0;
      document.getElementById('analyses-done').textContent = response.analysisCount || 0;

      const totalGames = response.wins + response.losses + response.draws;
      if (totalGames > 0) {
        const accuracy = Math.round((response.wins / totalGames) * 100);
        document.getElementById('accuracy').textContent = `${accuracy}%`;
      }
    }
  } catch (e) {
    console.log('Could not load stats');
  }

  // Settings button
  document.getElementById('open-settings').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url && (tab.url.includes('chess.com'))) {
      chrome.tabs.sendMessage(tab.id, { action: 'toggleSettings' });
      window.close();
    } else {
      alert('Please navigate to Chess.com first!');
    }
  });

  // Export button
  document.getElementById('export-data').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url && (tab.url.includes('chess.com'))) {
      chrome.tabs.sendMessage(tab.id, { action: 'exportAnalysis' });
      window.close();
    } else {
      alert('Please navigate to Chess.com to export analysis!');
    }
  });
});

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}
