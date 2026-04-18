import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.budget.app',
  productName: 'Budget',
  directories: {
    buildResources: 'resources'
  },
  files: ['out/**'],
  extraResources: [
    {
      from: 'build/python-bin',
      to: 'python-bin'
    }
  ],
  mac: {
    entitlementsInherit: 'build/entitlements.mac.plist',
    extendInfo: {
      NSCameraUsageDescription: "Application requests access to the device's camera.",
      NSMicrophoneUsageDescription: "Application requests access to the device's microphone."
    },
    notarize: false,
    target: [{ target: 'dmg' }, { target: 'zip' }]
  },
  win: {
    executableName: 'budget',
    target: [{ target: 'nsis' }]
  },
  linux: {
    target: [{ target: 'AppImage' }, { target: 'snap' }],
    maintainer: 'Tiffany',
    category: 'Finance'
  },
  nsis: {
    artifactName: '${name}-${version}-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always'
  }
}

export default config
