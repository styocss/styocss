// REF: https://github.com/unocss/unocss/blob/main/scripts/size.ts

import fs from 'node:fs/promises'
import { basename } from 'node:path'
import { sync as brotli } from 'brotli-size'
import { gzipSizeSync as gzip } from 'gzip-size'
import { minify } from 'terser'
import fg from 'fast-glob'
import { version } from '../package.json'

const packages = [
  'core',
  'atomic-macro-item-engine',
  'shared',
]

async function execute () {
  console.log()
  console.log(`styocss v${version}`)

  for (const pkg of packages) {
    const files = fg.sync(`packages/${pkg}/dist/**/*.mjs`, { absolute: true })
    let minified = ''
    for (const file of files) {
      const code = await fs.readFile(file, 'utf8')
      minified += (await minify(code)).code
    }

    console.log()
    console.log(`@styocss/${pkg}`)
    console.log(`gzip        ${(gzip(minified) / 1024).toFixed(2)} KiB`)
    console.log(`brotli      ${(brotli(minified) / 1024).toFixed(2)} KiB`)
  }

  const globals = await fg('packages/**/*.global.js', { absolute: true })

  console.log()
  for (const f of globals) {
    console.log()
    console.log(basename(f))
    const code = await fs.readFile(f, 'utf8')
    const minified = (await minify(code)).code || ''
    console.log(`gzip    ${(gzip(minified) / 1024).toFixed(2)} KiB`)
    console.log(`brotli  ${(brotli(minified) / 1024).toFixed(2)} KiB`)
  }
}

execute()
