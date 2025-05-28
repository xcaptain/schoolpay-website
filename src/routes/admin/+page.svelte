<script lang="ts">
  import { onMount } from 'svelte';
  import { isConnected, signer, provider, getEscrowContract, formatUSDC, formatAddress, CONTRACT_ADDRESS } from '$lib/wallet';
  import { ethers } from 'ethers';

  interface EscrowItem {
    invoiceRef: string;
    payer: string;
    university: string;
    amount: bigint;
    status: number;
    txHash?: string;
  }

  let escrows = $state<EscrowItem[]>([]);
  let loading = $state(false);
  let error = $state('');
  let success = $state('');
  let processingInvoice = $state('');

  // 状态枚举
  const EscrowStatus = {
    0: 'PENDING',
    1: 'DEPOSITED', 
    2: 'RELEASED',
    3: 'REFUNDED'
  };

  const StatusColors = {
    0: 'badge-warning',
    1: 'badge-info',
    2: 'badge-success', 
    3: 'badge-error'
  };

  onMount(() => {
    if ($isConnected) {
      loadEscrows();
    }
  });

  async function loadEscrows() {
    if (!$provider) return;

    loading = true;
    error = '';

    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS, // 使用导入的合约地址
        [
          'event Deposited(string indexed invoiceRef, address indexed payer, address indexed university, uint256 amount)',
          'function getEscrowInfo(string calldata invoiceRef) external view returns (tuple(address payer, address university, uint256 amount, string invoiceRef, uint8 status))'
        ],
        $provider
      );

      // 获取所有Deposited事件
      const depositedEvents = await contract.queryFilter('Deposited');
      
      const escrowPromises = depositedEvents.map(async (event) => {
        const invoiceRef = event.args?.[0];
        if (!invoiceRef) return null;

        try {
          const escrowInfo = await contract.getEscrowInfo(invoiceRef);
          return {
            invoiceRef,
            payer: escrowInfo[0],
            university: escrowInfo[1], 
            amount: escrowInfo[2],
            status: escrowInfo[4],
            txHash: event.transactionHash
          };
        } catch (err) {
          console.error(`获取托管信息失败 ${invoiceRef}:`, err);
          return null;
        }
      });

      const results = await Promise.all(escrowPromises);
      escrows = results.filter(Boolean) as EscrowItem[];
      
    } catch (err: any) {
      console.error('加载托管列表失败:', err);
      error = '加载数据失败：' + (err.message || '未知错误');
    } finally {
      loading = false;
    }
  }

  async function handleRelease(invoiceRef: string) {
    if (!$signer) {
      error = '请先连接钱包';
      return;
    }

    processingInvoice = invoiceRef;
    error = '';
    success = '';

    try {
      const contract = getEscrowContract($signer);
      const tx = await contract.release(invoiceRef);
      await tx.wait();
      
      success = `成功释放资金！交易哈希: ${tx.hash}`;
      
      // 重新加载数据
      await loadEscrows();
      
    } catch (err: any) {
      console.error('释放资金失败:', err);
      error = '释放失败：' + (err.message || '未知错误');
    } finally {
      processingInvoice = '';
    }
  }

  async function handleRefund(invoiceRef: string) {
    if (!$signer) {
      error = '请先连接钱包';
      return;
    }

    processingInvoice = invoiceRef;
    error = '';
    success = '';

    try {
      const contract = getEscrowContract($signer);
      const tx = await contract.refund(invoiceRef);
      await tx.wait();
      
      success = `成功退款！交易哈希: ${tx.hash}`;
      
      // 重新加载数据
      await loadEscrows();
      
    } catch (err: any) {
      console.error('退款失败:', err);
      error = '退款失败：' + (err.message || '未知错误');
    } finally {
      processingInvoice = '';
    }
  }

  function clearMessages() {
    error = '';
    success = '';
  }
</script>

<div class="max-w-6xl mx-auto">
  <div class="text-center mb-8">
    <h1 class="text-4xl font-bold mb-4">🛡️ 管理员后台</h1>
    <p class="text-gray-600">管理学费支付，确认或退款</p>
  </div>

  {#if !$isConnected}
    <div class="alert alert-warning">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <span>请先连接管理员钱包</span>
    </div>
  {:else}
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <h2 class="card-title">托管交易列表</h2>
          <button 
            class="btn btn-outline btn-sm" 
            class:loading={loading}
            onclick={loadEscrows}
            disabled={loading}
          >
            {loading ? '加载中...' : '刷新'}
          </button>
        </div>

        {#if error}
          <div class="alert alert-error mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        {/if}

        {#if success}
          <div class="alert alert-success mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{success}</span>
          </div>
        {/if}

        {#if loading && escrows.length === 0}
          <div class="flex justify-center py-8">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        {:else if escrows.length === 0}
          <div class="text-center py-8 text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>暂无托管交易</p>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="table table-zebra">
              <thead>
                <tr>
                  <th>发票编号</th>
                  <th>付款人</th>
                  <th>大学</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {#each escrows as escrow}
                  <tr>
                    <td>
                      <div class="font-mono text-sm">{escrow.invoiceRef}</div>
                      {#if escrow.txHash}
                        <a 
                          href="https://sepolia.etherscan.io/tx/{escrow.txHash}" 
                          target="_blank" 
                          class="link link-primary text-xs"
                        >
                          查看交易
                        </a>
                      {/if}
                    </td>
                    <td>
                      <div class="font-mono text-sm">{formatAddress(escrow.payer)}</div>
                    </td>
                    <td>
                      <div class="font-mono text-sm">{formatAddress(escrow.university)}</div>
                    </td>
                    <td>
                      <div class="font-semibold">{formatUSDC(escrow.amount)} USDC</div>
                    </td>
                    <td>
                      <div class="badge {StatusColors[escrow.status]}">
                        {EscrowStatus[escrow.status]}
                      </div>
                    </td>
                    <td>
                      <div class="flex gap-2">
                        {#if escrow.status === 1}
                          <!-- 已存款状态，可以释放或退款 -->
                          <button 
                            class="btn btn-success btn-sm"
                            class:loading={processingInvoice === escrow.invoiceRef}
                            onclick={() => handleRelease(escrow.invoiceRef)}
                            disabled={processingInvoice === escrow.invoiceRef}
                          >
                            {processingInvoice === escrow.invoiceRef ? '处理中...' : '确认支付'}
                          </button>
                          
                          <button 
                            class="btn btn-error btn-sm"
                            class:loading={processingInvoice === escrow.invoiceRef}
                            onclick={() => handleRefund(escrow.invoiceRef)}
                            disabled={processingInvoice === escrow.invoiceRef}
                          >
                            {processingInvoice === escrow.invoiceRef ? '处理中...' : '退款'}
                          </button>
                        {:else}
                          <span class="text-gray-500 text-sm">无可用操作</span>
                        {/if}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>

    <div class="mt-8">
      <div class="bg-base-100 rounded-lg p-6">
        <h3 class="text-lg font-semibold mb-4">📋 状态说明</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div class="flex items-center gap-2">
            <div class="badge badge-warning">PENDING</div>
            <span>等待学生存款</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="badge badge-info">DEPOSITED</div>
            <span>已存款，等待管理员处理</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="badge badge-success">RELEASED</div>
            <span>已确认，资金已释放给大学</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="badge badge-error">REFUNDED</div>
            <span>已退款给学生</span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
