# Front Desk AI Chrome Extension Guide

## Installation

### Development
1. Open Chrome → Settings → Extensions
2. Enable "Developer mode" (top-right)
3. Click "Load unpacked"
4. Select the `extension/` folder

### Configuration
Edit `extension/src/config.js` with your properties:
```javascript
const PROPERTIES = {
  'yourdomain.stayntouch.com': {
    id: 1,
    name: 'Your Property',
    urlPattern: 'yourproperty',
    toneGuidelines: 'Professional',
    checkoutTime: '11:00 AM',
    wifiSSID: 'YourProperty-Guest',
    apiEndpoint: 'http://localhost:3001'
  }
};
```

## Features

### Pipeline A: Guest Information
Automatically extracts from Stayntouch:
- Guest name
- Room number
- Check-in/out dates
- Reservation status

### Pipeline B: Chat Context
Captures from Akia:
- Active messages
- Sender names
- Allows message injection (review before send)

### Template System
- Search templates by name/tags
- Multi-select templates
- Combine into one response
- Toggle tone (Professional/Friendly)
- Copy or inject to chat

### Shift Notes
Display today's shift notes with facility updates and special instructions

## Usage

1. Click extension icon → "Open Sidepanel"
2. Login with dashboard credentials
3. Guest info auto-populates in Stayntouch
4. Chat context auto-captures in Akia
5. Select templates → Review response → Copy or Inject

## Troubleshooting

**Extension doesn't load:**
- Check manifest.json syntax
- Verify all file paths correct
- Check Chrome DevTools console

**Data not appearing:**
- Verify you're on supported domain
- Check content script in DevTools
- Verify CSS selectors match your PMS

**Auth fails:**
- Verify backend is running
- Check credentials
- Clear extension storage
