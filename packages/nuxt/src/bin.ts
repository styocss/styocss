#!/usr/bin/env node
/* v8 ignore file -- executable bootstrap is covered by built-bin smoke tests */
import process from 'node:process'
import { runCli } from './cli'

void runCli(process.argv.slice(2))
	.then((code) => {
		process.exitCode = code
	})
