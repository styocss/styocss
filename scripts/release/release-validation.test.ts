import { describe, expect, it } from 'vitest'
import { validateReleaseVersions } from '../release-validation.mjs'

const packages = [
	{ name: '@pikacss/core', version: '1.2.3' },
	{ name: '@pikacss/config', version: '1.2.3' },
]

describe('validateReleaseVersions', () => {
	it('accepts a matching tag and lockstep publishable package versions', () => {
		expect(validateReleaseVersions({
			tag: 'v1.2.3',
			rootVersion: '1.2.3',
			packages,
		}))
			.toEqual([])
	})

	it('rejects a tag that does not match the root version', () => {
		expect(validateReleaseVersions({
			tag: 'v1.2.4',
			rootVersion: '1.2.3',
			packages,
		}))
			.toEqual(['Tag v1.2.4 does not match package.json version 1.2.3.'])
	})

	it('rejects a publishable package that drifts from the root version', () => {
		expect(validateReleaseVersions({
			tag: 'v1.2.3',
			rootVersion: '1.2.3',
			packages: [...packages, { name: '@pikacss/plugin-new', version: '1.2.2' }],
		}))
			.toEqual(['Publishable package @pikacss/plugin-new has version 1.2.2; expected 1.2.3.'])
	})

	it('does not require private workspace packages to share the publish version', () => {
		expect(validateReleaseVersions({
			tag: 'v1.2.3',
			rootVersion: '1.2.3',
			packages: [...packages, { name: '@pikacss/internal-fixture', private: true, version: '0.1.0' }],
		}))
			.toEqual([])
	})
})
