<script lang="ts">
  import { onMount } from 'svelte';
  import { connectWallet, disconnectWallet, walletAddress, isConnected, formatAddress } from '$lib/wallet';

  let connecting = $state(false);
  let error = $state('');

  async function handleConnect() {
    connecting = true;
    error = '';
    
    try {
      await connectWallet();
    } catch (err: any) {
      error = err.message || '连接钱包失败';
    } finally {
      connecting = false;
    }
  }

  function handleDisconnect() {
    disconnectWallet();
  }

  // 检查是否已经连接钱包
  onMount(async () => {
    if (window.ethereum && window.ethereum.selectedAddress) {
      try {
        await connectWallet();
      } catch (err) {
        console.log('自动连接钱包失败:', err);
      }
    }

    // 监听账户变更
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', async (accounts: string[]) => {
        if (accounts.length === 0) {
          // 用户断开了所有账户
          disconnectWallet();
        } else {
          // 用户切换了账户，重新连接
          try {
            await connectWallet();
          } catch (err) {
            console.error('账户切换后重连失败:', err);
            disconnectWallet();
          }
        }
      });

      // 监听网络变更
      window.ethereum.on('chainChanged', (chainId: string) => {
        // 网络变更时重新加载页面
        window.location.reload();
      });
    }
  });
</script>

<div class="navbar bg-base-100 shadow-lg">
  <div class="navbar-start">
    <a href="/" class="btn btn-ghost text-xl">🎓 SchoolPay</a>
  </div>
  
  <div class="navbar-center">
    <div class="flex gap-2">
      <a href="/student" class="btn btn-ghost">学生页面</a>
      <a href="/admin" class="btn btn-ghost">管理员页面</a>
    </div>
  </div>
  
  <div class="navbar-end">
    {#if $isConnected}
      <div class="dropdown dropdown-end">
        <div tabindex="0" role="button" class="btn btn-ghost">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 bg-green-500 rounded-full"></div>
            <span>{formatAddress($walletAddress)}</span>
          </div>
        </div>
        <ul class="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow">
          <li><button onclick={handleDisconnect} class="text-error">断开连接</button></li>
        </ul>
      </div>
    {:else}
      <button 
        class="btn btn-primary" 
        class:loading={connecting}
        onclick={handleConnect}
        disabled={connecting}
      >
        {connecting ? '连接中...' : '连接钱包'}
      </button>
    {/if}
  </div>
</div>

{#if error}
  <div class="alert alert-error mt-4">
    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <span>{error}</span>
  </div>
{/if}
