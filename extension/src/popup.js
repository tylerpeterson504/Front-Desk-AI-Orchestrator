const openButton = document.getElementById('open-sidepanel');

if (openButton) {
  openButton.addEventListener('click', () => {
    try {
      if (!chrome.sidePanel?.open || !chrome.windows?.getCurrent) return;
      chrome.windows.getCurrent((currentWindow) => {
        if (chrome.runtime.lastError || !currentWindow?.id) return;
        chrome.sidePanel.open({ windowId: currentWindow.id }, () => {
          if (chrome.runtime.lastError) {
            console.error('Failed to open side panel:', chrome.runtime.lastError);
          }
        });
      });
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  });
}
