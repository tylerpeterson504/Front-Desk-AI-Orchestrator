// Open the Chrome side panel when the button is clicked
document.getElementById('open-sidepanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  await chrome.sidePanel.open({ tabId: tab.id });
  window.close();
});
