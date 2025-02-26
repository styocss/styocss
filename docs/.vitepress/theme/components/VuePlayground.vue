<script setup lang="ts">
import { Pane, Splitpanes } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
</script>

<template>
	<div
		:class="s({
			width: '100dvw',
			height: '100dvh',
		})"
	>
		<Splitpanes
			class="default-theme"
		>
			<Pane>
				Code
			</Pane>
			<Pane>
				Preview
			</Pane>
		</Splitpanes>
	</div>
</template>
