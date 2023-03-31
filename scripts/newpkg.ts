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
  const aliasTsPath = path.join(__dirname, '../alias.ts')

  const newPackageRootDir = path.join(packagesRootDir, newPackageInternalName)
  const newPackageTsconfigPath = path.join(__dirname, `../tsconfig.${newPackageInternalName}.json`)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const [pkgJson] = [require(pkgJsonPath) as any]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const [tsconfig, tsconfigBackup] = [require(tsconfigPath) as any, require(tsconfigPath) as any]
  const [aliasTsContent, aliasTsContentBackup] = Array.from({ length: 2 }, () => fs.readFileSync(aliasTsPath, { encoding: 'utf-8' })) as [string, string]
  try {
    // create tsconfig.[package].json
    fs.writeFileSync(newPackageTsconfigPath, `${`
{
  "extends": "@deviltea/tsconfig",
  "include": [
    "./packages/${newPackageInternalName}/src/**/*.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "rootDir": "./packages/${newPackageInternalName}/src",
    "tsBuildInfoFile": "./packages/${newPackageInternalName}/.tsbuildinfo"
  }
}
    `.trim()}\n`)
    // insert into tsconfig.json
    ;(tsconfig.references as any[]).push({
      path: `./tsconfig.${newPackageInternalName}.json`,
    })
    fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`)
    // insert into vitest alias
    const aliasTsLines = aliasTsContent.split('\n')
    aliasTsLines.splice(-2, 0, `  '${newPackageName}': fileURLToPath(new URL('./packages/${newPackageInternalName}/src/', import.meta.url)),`)
    fs.writeFileSync(aliasTsPath, aliasTsLines.join('\n'))
    // create dir
    fs.mkdirSync(newPackageRootDir)
    fs.mkdirSync(path.join(newPackageRootDir, 'src'))
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
    "build": "rimraf ./dist ./.tsbuildinfo && pnpm build:ts && pnpm build:dts && rimraf ./dist/temp ./.tsbuildinfo",
    "build:dts": "tsc -p ../../tsconfig.${newPackageInternalName}.json --declarationDir ./dist/temp --declaration --emitDeclarationOnly && tsup --no-config --entry.index ./dist/temp/index.d.ts --dtsOnly",
    "build:ts": "tsup"
  }
}    
    `.trim()}\n`)
    // create tsup.config.ts
    fs.writeFileSync(path.join(newPackageRootDir, 'tsup.config.ts'), `${`
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: './src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: false,
    clean: false,
  },
  // {
  //   entry: {
  //     index: './src/index.ts',
  //   },
  //   format: ['iife'],
  //   minify: true,
  //   dts: false,
  //   clean: false,
  // },
])     
    `.trim()}\n`)
    // create src/index.ts
    fs.writeFileSync(path.join(newPackageRootDir, 'src/index.ts'), 'export {}\n')
  } catch (error) {
    console.error(error)
    rmRf(newPackageRootDir)
    fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfigBackup, null, 2)}\n`)
    fs.writeFileSync(aliasTsPath, `${aliasTsContentBackup}\n`)
  }
}

execute()
