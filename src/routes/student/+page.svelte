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
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title">支付信息</h2>
        
        <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <div class="form-control">
            <label class="label" for="amount">
              <span class="label-text">学费金额 (USDC)</span>
            </label>
            <input 
              id="amount"
              type="number" 
              step="0.000001"
              placeholder="请输入学费金额" 
              class="input input-bordered" 
              bind:value={amount}
              disabled={loading}
              oninput={clearMessages}
            />
          </div>

          <div class="form-control">
            <label class="label" for="invoice">
              <span class="label-text">发票编号</span>
            </label>
            <input 
              id="invoice"
              type="text" 
              placeholder="请输入发票编号" 
              class="input input-bordered" 
              bind:value={invoiceRef}
              disabled={loading}
              oninput={clearMessages}
            />
          </div>

          <div class="form-control">
            <label class="label" for="university">
              <span class="label-text">大学钱包地址</span>
            </label>
            <input 
              id="university"
              type="text" 
              placeholder="0x..." 
              class="input input-bordered" 
              bind:value={universityAddress}
              disabled={loading}
              oninput={clearMessages}
            />
            <div class="label">
              <span class="label-text-alt">请输入大学提供的接收地址</span>
            </div>
          </div>

          <div class="form-control mt-6">
            <button 
              type="submit" 
              class="btn btn-primary" 
              class:loading={loading}
              disabled={loading || !amount || !invoiceRef || !universityAddress}
            >
              {#if loading}
                {#if step === 'approve'}
                  授权USDC中...
                {:else if step === 'deposit'}
                  支付中...
                {:else}
                  处理中...
                {/if}
              {:else}
                支付学费
              {/if}
            </button>
          </div>
        </form>

        {#if loading && step !== 'form'}
          <div class="alert alert-info mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div class="font-bold">
                {step === 'approve' ? '正在授权USDC' : '正在提交支付'}
              </div>
              <div class="text-xs">请在MetaMask中确认交易</div>
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
      <div class="bg-base-100 rounded-lg p-6">
        <h3 class="text-lg font-semibold mb-4">💡 支付流程说明</h3>
        <div class="steps">
          <div class="step step-primary">填写信息</div>
          <div class="step" class:step-primary={step === 'approve' || step === 'deposit'}>授权USDC</div>
          <div class="step" class:step-primary={step === 'deposit'}>提交支付</div>
          <div class="step">等待确认</div>
        </div>
        <div class="mt-4 text-sm text-gray-600">
          <p>1. 填写学费金额、发票编号和大学地址</p>
          <p>2. 授权合约使用您的USDC</p>
          <p>3. 提交支付交易，资金将被托管</p>
          <p>4. 管理员确认后，资金将释放给大学</p>
        </div>
      </div>
    </div>
  {/if}
</div>
