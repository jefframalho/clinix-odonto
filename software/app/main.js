// Clinix Odonto — versão para Windows (Electron)
// Abre o sistema online (sempre atualizado). Sem internet, usa a cópia que vem junto.
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

// Endereço do site publicado (troque depois de publicar no GitHub Pages ou Netlify)
const APP_URL = "https://jefframalho.github.io/clinix-odonto/";

function criarJanela() {
  const win = new BrowserWindow({
    width: 1300, height: 840, minWidth: 380, minHeight: 600,
    title: "Clinix Odonto", backgroundColor: "#F1F8FA",
    icon: path.join(__dirname, "icons", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: true }
  });
  Menu.setApplicationMenu(null);
  let usouLocal = false;
  const abrirLocal = () => { if (!usouLocal) { usouLocal = true; win.loadFile(path.join(__dirname, "index.html")); } };
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => { if (isMain) abrirLocal(); });
  win.loadURL(APP_URL).catch(abrirLocal);
  const interno = url => url.startsWith(APP_URL) || url.startsWith("file://");
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!interno(url)) { e.preventDefault(); shell.openExternal(url); } });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(criarJanela);
  app.on("window-all-closed", () => app.quit());
}
