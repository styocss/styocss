import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'pathe'
import { $ } from 'zx'

console.log('Preparing local install...')

const root = fileURLToPath(new URL('..', import.meta.url))
const outputDir = join(root, 'packages/dist')

await ($`rm -rf ${outputDir}`).catch(() => {})
await $`mkdir -p ${outputDir}`

const packages = [
	'core',
	'integration',
	'vite',
	'nuxt',
]

for (const pkg of packages) {
	const packageDir = join(root, 'packages', pkg)
	const tarball = join(outputDir, `${pkg}.tgz`)
	const ourputPackageDir = join(outputDir, pkg)
	await $`cd ${packageDir} \
            && pnpm pack | xargs -I {} mv {} "${tarball}" \
            && cd ${outputDir} \
            && tar -xzf ${tarball} \
            && rm ${tarball} \
            && mv package ${pkg}`

	if (pkg === 'core')
		continue

	const pkgJson = JSON.parse((await $`cat ${join(ourputPackageDir, 'package.json')}`).stdout)
	if (pkg === 'integration') {
		pkgJson.dependencies['@styocss/core'] = `file:${join(outputDir, 'core')}`
	}
	else if (pkg === 'vite') {
		pkgJson.dependencies['@styocss/integration'] = `file:${join(outputDir, 'integration')}`
	}
	else if (pkg === 'nuxt') {
		pkgJson.dependencies['@styocss/vite-plugin-styocss'] = `file:${join(outputDir, 'vite')}`
	}
	await writeFile(join(ourputPackageDir, 'package.json'), JSON.stringify(pkgJson, null, 2))
}

console.log('Local install prepared.')
