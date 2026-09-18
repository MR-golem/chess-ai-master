# ♟️ Chess AI Master

**The most advanced chess analysis engine — IQ: 9,000,000**

Chess AI Master is a browser extension for [Chess.com](https://www.chess.com) that runs a **Stockfish engine directly in your browser**, analyzes every move in real time, draws the best-move arrows on the board, and can even auto-play for you.

---

## ✨ Features

| | |
|---|---|
| 🧠 **Stockfish Engine** | Runs in a Web Worker — no server required |
| 🎯 **Best-Move Arrows** | Multi-line arrows drawn directly on the board |
| 📊 **Live Evaluation** | Centipawn / mate scores with depth & NPS |
| 📈 **Analysis Lines** | Top engine lines with scores |
| 🛡️ **Threat Detection** | Instant alerts when you're winning or losing |
| 🚀 **Auto Play** | Optional automatic move injection |
| 🎮 **Floating Panel** | Drag it anywhere — minimize to a **resizable icon** |
| ⚙️ **Persistent Settings** | Settings, panel position & icon size are saved |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl` + `Shift` + `X` | Toggle panel (minimize / expand) |
| `Ctrl` + `Shift` + `S` | Start / Stop analysis |
| `Ctrl` + `Shift` + `P` | Toggle Auto Play |
| `Ctrl` + `Shift` + `A` | Toggle arrows |

---

## 🚀 Installation

### Chrome / Edge / Brave
1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right corner)
4. Click **Load unpacked**
5. Select the project folder
6. Open [chess.com](https://www.chess.com) and start playing

### Firefox
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json`

---

## 🗂️ Project Structure

```
chess-ai-master/
├── manifest.json          # Extension manifest (Manifest V3)
├── package.json           # Project metadata
├── package-lock.json      # Lockfile
├── icons/
│   └── icon.png           # Extension icon
├── popup/
│   ├── popup.html         # Popup UI
│   └── popup.js           # Popup logic
└── scripts/
    ├── background.js      # Background service worker
    ├── main.js            # Content script (panel + engine)
    └── page.js            # Page bridge (plays moves)
```

---

## 🔧 Development

```bash
# Install dependencies (optional)
npm install

# Run lint (placeholder)
npm run lint
```

---

## ⚙️ Settings

Open the panel and click the gear icon **⚙**:

- **Depth** — engine search depth (1–40)
- **Time (ms)** — time per move (500–30,000 ms)
- **Multi-PV** — number of lines shown (1–5)
- **Show Arrows** — toggle best-move arrows
- **Auto Play** — toggle automatic move playing

All settings are saved automatically to `chrome.storage.local`, together with the panel position and icon size.

---

## ⚠️ Disclaimer

Use this tool responsibly. Only use it in unrated games, puzzles, or your own analysis.

---

## 👤 Developer

**MR-golem** — [dontosintme69@gmail.com](mailto:dontosintme69@gmail.com)

## 📄 License

ISC © MR-golem

A
A
A
A
A
A
A
A
A
A
A
A
A
A
A
A
A