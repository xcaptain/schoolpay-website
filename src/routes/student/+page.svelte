<script lang="ts">
  import { onMount } from 'svelte';
  import { isConnected, signer, getEscrowContract, getUSDCContract, parseUSDC, walletAddress, checkWalletAddress, switchToActiveWallet } from '$lib/wallet';
  import { ethers } from 'ethers';

  let amount: number = $state(0);
  let invoiceRef = $state('');
  let universityAddress = $state('0x720aC46FdB6da28FA751bc60AfB8094290c2B4b7');
  let loading = $state(false);
  let success = $state('');
  let error = $state('');
  let step = $state<'form' | 'approve' | 'deposit'>('form');

  async function handleSubmit() {
    if (!$isConnected || !$signer) {
      error = '请先连接钱包';
      return;
    }

    if (!amount || !invoiceRef || !universityAddress) {
      error = '请填写所有字段';
      return;
    }

    if (!ethers.isAddress(universityAddress)) {
      error = '请输入有效的大学地址';
      return;
    }

    loading = true;
    error = '';
    success = '';

    try {
      // 步骤0: 检查钱包地址是否一致
      const walletCheck = await checkWalletAddress();
      if (!walletCheck.isValid) {
        const shouldSwitch = confirm(
          `检测到钱包地址不一致：\n` +
          `当前连接地址: ${walletCheck.currentAddress}\n` +
          `MetaMask活跃地址: ${walletCheck.activeAddress}\n\n` +
          `是否切换到MetaMask活跃地址？`
        );
        
        if (shouldSwitch) {
          await switchToActiveWallet();
          // 重新获取signer，因为地址可能已经改变
          if (!$signer) {
            throw new Error('切换钱包后无法获取签名器');
          }
        } else {
          throw new Error('请使用正确的钱包地址进行支付');
        }
      }

      const amountBigInt = parseUSDC(amount);
      const escrowContract = getEscrowContract($signer);
      const usdcContract = getUSDCContract($signer);

      // 步骤1: 检查USDC余额
      const balance = await usdcContract.balanceOf($walletAddress);
      if (balance < amountBigInt) {
        throw new Error(`USDC余额不足。当前余额: ${ethers.formatUnits(balance, 6)} USDC`);
      }

      // 步骤2: 检查授权额度
      step = 'approve';
      const allowance = await usdcContract.allowance($walletAddress, escrowContract.target);
      
      if (allowance < amountBigInt) {
        // 需要授权
        const approveTx = await usdcContract.approve(escrowContract.target, amountBigInt);
        await approveTx.wait();
      }

      // 步骤3: 存款
      step = 'deposit';
      const depositTx = await escrowContract.deposit(invoiceRef, amountBigInt);
      await depositTx.wait();

      success = `学费支付成功！交易哈希: ${depositTx.hash}`;
      
      // 重置表单
      amount = '';
      invoiceRef = '';
      universityAddress = '';
      step = 'form';
      
    } catch (err: any) {
      console.error('支付失败:', err);
      error = err.message || '支付失败，请重试';
      step = 'form';
    } finally {
      loading = false;
    }
  }

  function clearMessages() {
    error = '';
    success = '';
  }
</script>

<div class="max-w-2xl mx-auto">
  <div class="text-center mb-8">
    <h1 class="text-4xl font-bold mb-4">💳 学费支付</h1>
    <p class="text-gray-600">使用USDC支付您的学费，安全便捷</p>
  </div>

  {#if !$isConnected}
    <div class="alert alert-warning">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <span>请先连接您的MetaMask钱包</span>
    </div>
  {:else}
    <div class="card bg-base-100 shadow-xl border border-base-300">
      <div class="card-body p-8">
        <h2 class="card-title text-2xl mb-6 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          支付信息
        </h2>
        
        <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
          <div class="form-control w-full">
            <label class="label" for="amount">
              <span class="label-text font-medium">学费金额 (USDC)</span>
              <span class="label-text-alt text-gray-500">必填</span>
            </label>
            <input 
              id="amount"
              type="number" 
              step="0.000001"
              placeholder="请输入学费金额" 
              class="input input-bordered w-full focus:input-primary" 
              bind:value={amount}
              disabled={loading}
              oninput={clearMessages}
            />
          </div>

          <div class="form-control w-full">
            <label class="label" for="invoice">
              <span class="label-text font-medium">发票编号</span>
              <span class="label-text-alt text-gray-500">必填</span>
            </label>
            <input 
              id="invoice"
              type="text" 
              placeholder="请输入发票编号" 
              class="input input-bordered w-full focus:input-primary" 
              bind:value={invoiceRef}
              disabled={loading}
              oninput={clearMessages}
            />
          </div>

          <div class="form-control w-full">
            <label class="label" for="university">
              <span class="label-text font-medium">大学钱包地址</span>
              <span class="label-text-alt text-gray-500">必填</span>
            </label>
            <input 
              id="university"
              type="text" 
              placeholder="0x..." 
              class="input input-bordered w-full focus:input-primary font-mono" 
              bind:value={universityAddress}
              disabled={loading}
              oninput={clearMessages}
            />
            <div class="label">
              <span class="label-text-alt text-gray-500">请输入大学提供的接收地址</span>
            </div>
          </div>

          <div class="form-control w-full mt-8">
            <button 
              type="submit" 
              class="btn btn-primary btn-lg w-full" 
              class:loading={loading}
              disabled={loading || !amount || !invoiceRef || !universityAddress}
            >
              {#if loading}
                <span class="loading loading-spinner loading-sm"></span>
                {#if step === 'approve'}
                  授权USDC中...
                {:else if step === 'deposit'}
                  支付中...
                {:else}
                  处理中...
                {/if}
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                支付学费
              {/if}
            </button>
          </div>
        </form>

        {#if loading && step !== 'form'}
          <div class="alert alert-info mt-6">
            <div class="flex items-center">
              <span class="loading loading-spinner loading-md mr-3"></span>
              <div>
                <div class="font-bold text-info-content">
                  {step === 'approve' ? '正在授权USDC' : '正在提交支付'}
                </div>
                <div class="text-sm text-info-content/80">请在MetaMask中确认交易</div>
              </div>
            </div>
          </div>
        {/if}

        {#if error}
          <div class="alert alert-error mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        {/if}

        {#if success}
          <div class="alert alert-success mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{success}</span>
          </div>
        {/if}
      </div>
    </div>

    <div class="mt-8">
      <div class="card bg-base-100 shadow-lg border border-base-300">
        <div class="card-body p-6">
          <h3 class="text-xl font-semibold mb-6 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            支付流程说明
          </h3>
          <div class="steps steps-vertical lg:steps-horizontal">
            <div class="step step-primary">填写信息</div>
            <div class="step" class:step-primary={step === 'approve' || step === 'deposit'}>授权USDC</div>
            <div class="step" class:step-primary={step === 'deposit'}>提交支付</div>
            <div class="step">等待确认</div>
          </div>
          <div class="mt-6 space-y-2">
            <div class="flex items-start">
              <span class="badge badge-primary badge-sm mt-1 mr-3">1</span>
              <span class="text-sm">填写学费金额、发票编号和大学地址</span>
            </div>
            <div class="flex items-start">
              <span class="badge badge-primary badge-sm mt-1 mr-3">2</span>
              <span class="text-sm">授权合约使用您的USDC</span>
            </div>
            <div class="flex items-start">
              <span class="badge badge-primary badge-sm mt-1 mr-3">3</span>
              <span class="text-sm">提交支付交易，资金将被托管</span>
            </div>
            <div class="flex items-start">
              <span class="badge badge-primary badge-sm mt-1 mr-3">4</span>
              <span class="text-sm">管理员确认后，资金将释放给大学</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
