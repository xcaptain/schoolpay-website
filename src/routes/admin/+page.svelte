<script lang="ts">
  import { onMount } from 'svelte';
  import { isConnected, signer, provider, getEscrowContract, formatUSDC, formatAddress, CONTRACT_ADDRESS, parseUSDC } from '$lib/wallet';
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

  // 表单状态
  let formData = $state({
    payerAddress: '0xD226eb79Bfa519b51DADB9AA9Eab2E4357170B43',
    universityAddress: '0x720aC46FdB6da28FA751bc60AfB8094290c2B4b7',
    amount: '',
    invoiceRef: ''
  });
  let isSubmitting = $state(false);
  let formError = $state('');
  
  // 本地存储的已知发票编号列表（包括刚创建的）
  let knownInvoiceRefs = $state(new Set<string>());

  // 状态枚举
  const EscrowStatus: { [key: number]: string } = {
    0: 'PENDING',
    1: 'DEPOSITED', 
    2: 'RELEASED',
    3: 'REFUNDED'
  };

  const StatusColors: { [key: number]: string } = {
    0: 'badge-warning',
    1: 'badge-info',
    2: 'badge-success', 
    3: 'badge-error'
  };

  // localStorage 相关函数
  const ESCROWS_STORAGE_KEY = 'admin_escrows_data';
  const KNOWN_INVOICES_STORAGE_KEY = 'admin_known_invoices';

  function saveEscrowsToStorage(escrowsData: EscrowItem[]) {
    try {
        console.log('saveEscrowsToStorage:', escrowsData);
      localStorage.setItem(ESCROWS_STORAGE_KEY, JSON.stringify(escrowsData.map(e => ({
        ...e,
        status: e.status.toString(),
        amount: e.amount.toString()
      }))));
    } catch (err) {
      console.error('保存托管数据到本地存储失败:', err);
    }
  }

  function loadEscrowsFromStorage(): EscrowItem[] {
    try {
      const stored = localStorage.getItem(ESCROWS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((e: any) => ({
          ...e,
          amount: BigInt(e.amount), // 将字符串转换回 BigInt
          status: parseInt(e.status, 10) // 将字符串转换回 BigInt
        }));
      }
    } catch (err) {
      console.error('从本地存储加载托管数据失败:', err);
    }
    return [];
  }

  function saveKnownInvoicesToStorage(invoices: Set<string>) {
    try {
      localStorage.setItem(KNOWN_INVOICES_STORAGE_KEY, JSON.stringify(Array.from(invoices)));
    } catch (err) {
      console.error('保存已知发票列表到本地存储失败:', err);
    }
  }

  function loadKnownInvoicesFromStorage(): Set<string> {
    try {
      const stored = localStorage.getItem(KNOWN_INVOICES_STORAGE_KEY);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (err) {
      console.error('从本地存储加载已知发票列表失败:', err);
    }
    return new Set();
  }

  function clearLocalStorage() {
    try {
      localStorage.removeItem(ESCROWS_STORAGE_KEY);
      localStorage.removeItem(KNOWN_INVOICES_STORAGE_KEY);
      escrows = [];
      knownInvoiceRefs = new Set();
      success = '本地缓存已清除';
    } catch (err) {
      console.error('清除本地存储失败:', err);
      error = '清除缓存失败';
    }
  }

  onMount(() => {
    // 先从本地存储加载数据
    const cachedEscrows = loadEscrowsFromStorage();
    const cachedInvoices = loadKnownInvoicesFromStorage();
    
    if (cachedEscrows.length > 0) {
      escrows = cachedEscrows;
    }
    if (cachedInvoices.size > 0) {
      knownInvoiceRefs = cachedInvoices;
    }
    
    // 如果已连接钱包，则尝试更新数据
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
        CONTRACT_ADDRESS,
        [
          'event Deposited(string indexed invoiceRef, address indexed payer, address indexed university, uint256 amount)',
          'function getEscrowInfo(string calldata invoiceRef) external view returns (tuple(address payer, address university, uint256 amount, string invoiceRef, uint8 status))'
        ],
        $provider
      );

      // 获取所有Deposited事件中的发票编号
      const depositedEvents = await contract.queryFilter('Deposited');
      depositedEvents.forEach(event => {
        // 确保这是一个 EventLog 而不是 Log
        if ('args' in event && event.args?.[0]) {
          knownInvoiceRefs.add(event.args[0]);
        }
      });

      // 为所有已知的发票编号获取当前状态
      const escrowPromises = Array.from(knownInvoiceRefs).map(async (invoiceRef) => {
        try {
            console.log(`正在获取托管信息: ${invoiceRef}`);
          const escrowInfo = await contract.getEscrowInfo(invoiceRef);

          console.log(`获取托管信息: ${invoiceRef}`, escrowInfo);
          
          // 查找对应的交易哈希
          const depositedEvent = depositedEvents.find(e => 'args' in e && e.args?.[0] === invoiceRef);
          const txHash = depositedEvent?.transactionHash || '';
          
          return {
            invoiceRef,
            payer: escrowInfo[0],
            university: escrowInfo[1], 
            amount: escrowInfo[2],
            status: escrowInfo[4],
            txHash
          };
        } catch (err) {
          console.error(`获取托管信息失败 ${invoiceRef}:`, err);
          return null;
        }
      });

      const results = await Promise.all(escrowPromises);
      escrows = results.filter(Boolean) as EscrowItem[];

      console.log('加载的托管数据:', escrows);
      
      // 保存到本地存储
      saveEscrowsToStorage(escrows);
      saveKnownInvoicesToStorage(knownInvoiceRefs);
      
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
    formError = '';
  }

  async function handleInitialize() {
    if (!$signer) {
      formError = '请先连接钱包';
      return;
    }

    // 验证表单数据
    if (!formData.payerAddress || !formData.universityAddress || !formData.amount || !formData.invoiceRef) {
      formError = '请填写所有必填字段';
      return;
    }

    // 验证地址格式
    if (!ethers.isAddress(formData.payerAddress)) {
      formError = '付款人地址格式不正确';
      return;
    }

    if (!ethers.isAddress(formData.universityAddress)) {
      formError = '大学地址格式不正确';
      return;
    }

    // 验证金额
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      formError = '请输入有效的金额';
      return;
    }

    isSubmitting = true;
    formError = '';
    error = '';
    success = '';

    try {
      const contract = getEscrowContract($signer);
      const amountInWei = parseUSDC(amount);
      
      const tx = await contract.initialize(
        formData.payerAddress,
        formData.universityAddress,
        amountInWei,
        formData.invoiceRef
      );
      
      await tx.wait();
      
      success = `成功初始化托管交易！交易哈希: ${tx.hash}`;
      
      // 将新的发票编号添加到已知列表中
      knownInvoiceRefs.add(formData.invoiceRef);
      
      // 保存到本地存储
      saveKnownInvoicesToStorage(knownInvoiceRefs);
      
      // 清空表单
      formData = {
        payerAddress: '',
        universityAddress: '',
        amount: '',
        invoiceRef: ''
      };
      
      // 重新加载数据
      await loadEscrows();
      
    } catch (err: any) {
      console.error('初始化托管交易失败:', err);
      formError = '初始化失败：' + (err.message || '未知错误');
    } finally {
      isSubmitting = false;
    }
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
          <div class="flex gap-2">
            <button 
              class="btn btn-outline btn-sm" 
              class:loading={loading}
              onclick={loadEscrows}
              disabled={loading}
            >
              {loading ? '刷新中...' : '🔄 刷新'}
            </button>
            <button 
              class="btn btn-error btn-sm" 
              onclick={clearLocalStorage}
            >
              🗑️ 清除缓存
            </button>
          </div>
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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
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
        
        <div class="divider"></div>
        
        <div class="mt-4">
          <h4 class="font-semibold mb-2">💾 本地缓存说明：</h4>
          <ul class="text-sm space-y-1 text-gray-600">
            <li>• 交易数据会自动保存到浏览器本地存储</li>
            <li>• 页面刷新后会自动加载缓存的数据</li>
            <li>• 点击"清除缓存"按钮可以清空所有本地数据</li>
            <li>• 缓存包括已初始化的订单和链上查询的交易状态</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 新增初始化托管交易表单 -->
    <div class="mt-8">
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title">🆕 初始化新的托管交易</h2>
          <p class="text-gray-600 mb-4">为学生创建一个新的学费支付托管交易</p>
          
          {#if formError}
            <div class="alert alert-error mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formError}</span>
            </div>
          {/if}

          <form onsubmit={(e) => { e.preventDefault(); handleInitialize(); }} class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label" for="invoiceRef">
                  <span class="label-text">发票编号 *</span>
                </label>
                <input 
                  id="invoiceRef"
                  type="text" 
                  placeholder="例如: INV2024001" 
                  class="input input-bordered" 
                  bind:value={formData.invoiceRef}
                  disabled={isSubmitting}
                  required
                />
              </div>
              
              <div class="form-control">
                <label class="label" for="amount">
                  <span class="label-text">金额 (USDC) *</span>
                </label>
                <input 
                  id="amount"
                  type="number" 
                  step="0.01"
                  min="0"
                  placeholder="例如: 1000.00" 
                  class="input input-bordered" 
                  bind:value={formData.amount}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <div class="form-control">
              <label class="label" for="payerAddress">
                <span class="label-text">付款人地址 (学生钱包地址) *</span>
              </label>
              <input 
                id="payerAddress"
                type="text" 
                placeholder="0x..." 
                class="input input-bordered font-mono" 
                bind:value={formData.payerAddress}
                disabled={isSubmitting}
                required
              />
            </div>

            <div class="form-control">
              <label class="label" for="universityAddress">
                <span class="label-text">大学地址 (接收方钱包地址) *</span>
              </label>
              <input 
                id="universityAddress"
                type="text" 
                placeholder="0x..." 
                class="input input-bordered font-mono" 
                bind:value={formData.universityAddress}
                disabled={isSubmitting}
                required
              />
            </div>

            <div class="form-control mt-6">
              <button 
                type="submit" 
                class="btn btn-primary"
                class:loading={isSubmitting}
                disabled={isSubmitting}
              >
                {isSubmitting ? '初始化中...' : '🚀 初始化托管交易'}
              </button>
            </div>
          </form>

          <div class="mt-4 p-4 bg-base-200 rounded-lg">
            <h4 class="font-semibold mb-2">💡 使用说明：</h4>
            <ul class="text-sm space-y-1 text-gray-600">
              <li>• 填写学生的钱包地址作为付款人</li>
              <li>• 填写大学的钱包地址作为接收方</li>
              <li>• 设置学费金额（以USDC计算）</li>
              <li>• 发票编号应该是唯一的标识符</li>
              <li>• 初始化后，交易状态将为 PENDING，等待学生存款</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
