import fs from 'node:fs'
import path from 'node:path'
import inquirer from 'inquirer'

function rmRf (p: string) {
  try {
    fs.rmSync(p, {
      recursive: true,
      force: true,
    })
  } catch {}
}

async function execute () {
  const packagesRootDir = path.join(__dirname, '../packages')
  const newPackageName = String((await inquirer.prompt(
    [
      {
        type: 'input',
        name: 'newPackageName',
        message: 'The name of new package ?',
        default: '@styocss/newpkg',
        validate (input) {
          if (!/[a-zA-Z0-9@\/]+/.test(input))
            return 'Invalid package name.'

          if (fs.readdirSync(packagesRootDir).includes(input))
            return 'Duplicated Package name.'

          return true
        },
      },
    ],
  )).newPackageName)
  const newPackageInternalName = newPackageName.replace('@styocss/', '')

  const pkgJsonPath = path.join(__dirname, '../package.json')
  const tsconfigPath = path.join(__dirname, '../tsconfig.json')
  const tsconfigTestsPath = path.join(__dirname, '../tsconfig.tests.json')
  const tsconfigPackagesPath = path.join(__dirname, '../tsconfig.packages.json')
  const aliasTsPath = path.join(__dirname, '../alias.ts')
  const tempDtsAliasTsPath = path.join(__dirname, '../temp-dts-alias.ts')

  const newPackageRootDir = path.join(packagesRootDir, newPackageInternalName)
  const newPackageReadmePath = path.join(newPackageRootDir, 'README.md')
  const newPackageTsconfigPath = path.join(__dirname, `../tsconfig.${newPackageInternalName}.json`)
  const newPackageTestFilePath = path.join(__dirname, `../tests/${newPackageInternalName}.test.ts`)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const [pkgJson] = [require(pkgJsonPath) as any]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const [tsconfig, tsconfigBackup] = [require(tsconfigPath) as any, require(tsconfigPath) as any]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const [tsconfigTests, tsconfigTestsBackup] = [require(tsconfigTestsPath) as any, require(tsconfigTestsPath) as any]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const [tsconfigPackages, tsconfigPackagesBackup] = [require(tsconfigPackagesPath) as any, require(tsconfigPackagesPath) as any]
  const [aliasTsContent, aliasTsContentBackup] = Array.from({ length: 2 }, () => fs.readFileSync(aliasTsPath, { encoding: 'utf-8' })) as [string, string]
  const [tempDtsAliasTsContent, tempDtsAliasTsContentBackup] = Array.from({ length: 2 }, () => fs.readFileSync(tempDtsAliasTsPath, { encoding: 'utf-8' })) as [string, string]
  try {
    // create dir
    try {
      fs.mkdirSync(newPackageRootDir)
    } catch (e) {
      console.error(`Failed to create directory: ${newPackageRootDir}`)
      console.error(e)
      return
    }
    fs.mkdirSync(path.join(newPackageRootDir, 'src'))

    // create tsconfig.[package].json
    fs.writeFileSync(newPackageTsconfigPath, `${`
{
  "extends": "./tsconfig.packages.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./packages/${newPackageInternalName}/.tsbuildinfo"
  }
}
    `.trim()}\n`)

    // insert into tsconfig.json
    ;(tsconfig.references as any[]).push({
      path: `./tsconfig.${newPackageInternalName}.json`,
    })
    fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`)

    // insert into tsconfig.tests.json
    ;(tsconfigTests.compilerOptions.files as any[]).push(`./packages/${newPackageInternalName}/src/index.ts`)
    ;(tsconfigTests.compilerOptions.paths as Record<any, any>)[newPackageName] = [`./packages/${newPackageInternalName}/src/index.ts`]
    fs.writeFileSync(tsconfigTestsPath, `${JSON.stringify(tsconfigTests, null, 2)}\n`)

    // insert into tsconfig.packages.json
    ;(tsconfigPackages.compilerOptions.include as any[]).push(`./packages/${newPackageInternalName}/src/**/*.ts`)
    ;(tsconfigPackages.compilerOptions.paths as Record<any, any>)[newPackageName] = [`./packages/${newPackageInternalName}/src/index.ts`]
    fs.writeFileSync(tsconfigPackagesPath, `${JSON.stringify(tsconfigPackages, null, 2)}\n`)

    // insert into alias.ts
    const aliasTsLines = aliasTsContent.split('\n')
    aliasTsLines.splice(-2, 0, `  '${newPackageName}': fileURLToPath(new URL('./packages/${newPackageInternalName}/src/', import.meta.url)),`)
    fs.writeFileSync(aliasTsPath, aliasTsLines.join('\n'))

    // insert into temp-dts-alias.ts
    const tempDtsAliasTsLines = tempDtsAliasTsContent.split('\n')
    tempDtsAliasTsLines.splice(-2, 0, `  '${newPackageName}': './dist/temp/packages/${newPackageInternalName}/src/index.d.ts',`)
    fs.writeFileSync(tempDtsAliasTsPath, tempDtsAliasTsLines.join('\n'))

    // create package.json
    fs.writeFileSync(path.join(newPackageRootDir, 'package.json'), `${`
{
  "name": "${newPackageName}",
  "publishConfig": {
    "access": "public"
  },
  "version": "${pkgJson.version}",
  "author": "DevilTea <ch19980814@gmail.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/DevilTea/styocss.git",
    "directory": "packages/${newPackageInternalName}"
  },
  "bugs": {
    "url": "https://github.com/DevilTea/styocss/issues"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js",
      "import": "./dist/index.mjs"
    }
  },
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "rimraf ./dist ./.tsbuildinfo && pnpm build:temp-dts && pnpm build:tsup && rimraf ./dist/temp ./.tsbuildinfo",
    "build:temp-dts": "tsc -p ../../tsconfig.${newPackageInternalName}.json --declarationDir ./dist/temp --declaration --emitDeclarationOnly",
    "build:tsup": "tsup"
  }
}    
    `.trim()}\n`)

    // create tsup.config.ts
    fs.writeFileSync(path.join(newPackageRootDir, 'tsup.config.ts'), `${`
import { defineConfig } from 'tsup'
import { tempDtsAlias } from '../../temp-dts-alias'

export default defineConfig([
  // Build js files
  {
    entry: {
      index: './src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: false,
    clean: false,
  },
  // Build dts files
  {
    entry: {
      index: tempDtsAlias['${newPackageName}}'],
    },
    dts: {
      only: true,
    },
    clean: false,
  },
])     
    `.trim()}\n`)

    // create src/index.ts
    fs.writeFileSync(path.join(newPackageRootDir, 'src/index.ts'), 'export {}\n')

    // create README.md
    fs.writeFileSync(newPackageReadmePath, `# ${newPackageName}\n`)

    // create test file
    fs.writeFileSync(newPackageTestFilePath, `${`
import { describe, it, expect } from 'vitest'

describe('Hello ${newPackageName}', () => {
  it('works', () => {
    expect(1).toBe(1)
  })
})
    `.trim()}\n`)
  } catch (error) {
    console.error(error)
    rmRf(newPackageRootDir)
    rmRf(newPackageTsconfigPath)
    rmRf(newPackageTestFilePath)
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfigBackup, null, 2))
    fs.writeFileSync(tsconfigTestsPath, JSON.stringify(tsconfigTestsBackup, null, 2))
    fs.writeFileSync(tsconfigPackagesPath, JSON.stringify(tsconfigPackagesBackup, null, 2))
    fs.writeFileSync(aliasTsPath, aliasTsContentBackup)
    fs.writeFileSync(tempDtsAliasTsPath, tempDtsAliasTsContentBackup)
  }
}

execute()
