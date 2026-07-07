// Expo 모노레포 metro 설정 — 워크스페이스 루트를 watch하고 hoist된 node_modules를 해석.
// (Expo docs: "Work with monorepos") @mono/shared 등 workspace 패키지 resolve 필수.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
