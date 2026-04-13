import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { initDb } from './db/schema'
import { registerIpcHandlers } from './ipc/handlers'
import { parserRegistry } from './parsers/registry'
import { UOBCreditParser } from './parsers/uobCredit'
import { PayLahParser } from './parsers/paylah'
import { DBSDebitParser } from './parsers/dbsDebit'
import { OCBCDebitParser } from './parsers/ocbcDebit'
import { RevolutWalletParser } from './parsers/revolutWallet'
import { PayLahPdfParser } from './parsers/paylahPdf'
import { GenericCsvParser } from './parsers/genericCsv'

log.initialize()
log.transports.file.level = 'debug'
log.transports.console.level = is.dev ? 'debug' : false

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDb()
  parserRegistry.register(new UOBCreditParser())
  parserRegistry.register(new PayLahParser())
  parserRegistry.register(new PayLahPdfParser())
  parserRegistry.register(new DBSDebitParser())
  parserRegistry.register(new OCBCDebitParser())
  parserRegistry.register(new RevolutWalletParser())
  parserRegistry.register(new GenericCsvParser()) // fallback — must be last
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
