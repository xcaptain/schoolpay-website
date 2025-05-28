<script lang="ts">
	import '../app.css';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	let { children } = $props();
</script>

<div class="min-h-screen bg-base-200">
	<WalletConnect />
	<main class="container mx-auto px-4 py-8">
		{@render children()}
	</main>
</div>
