<script>
	import { createEventDispatcher } from 'svelte';

	export let count = 0;

	const dispatch = createEventDispatcher();
</script>

<button on:click={() => dispatch('close')}>v1 {count}</button>
