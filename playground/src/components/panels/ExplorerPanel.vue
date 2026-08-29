<script setup lang="ts">
import { computed } from 'vue'
import { activeFilePath, onFileSelect, projectTree } from '../../composables/useWorkbench'
import { explorerTree, workspaceFsReady } from '../../composables/useWorkspaceFs'
import FileTree from '../FileTree.vue'

defineOptions({ name: 'ExplorerPanel' })

const visibleTree = computed(() => workspaceFsReady.value ? explorerTree : projectTree)
</script>

<template>
	<div class="explorer-panel">
		<div class="panel-content">
			<FileTree
				:tree="visibleTree"
				:activePath="activeFilePath"
				@select="onFileSelect"
			/>
		</div>
	</div>
</template>

<style scoped>
.explorer-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #252526;
}

.panel-content {
    flex: 1;
    overflow: auto;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
}
</style>
