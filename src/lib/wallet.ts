import { ethers } from 'ethers';
import { writable } from 'svelte/store';

// 钱包状态存储
export const walletAddress = writable<string>('');
export const isConnected = writable<boolean>(false);
export const provider = writable<ethers.BrowserProvider | null>(null);
export const signer = writable<ethers.JsonRpcSigner | null>(null);

// 合约地址和ABI (你需要替换为实际部署的合约地址)
export const CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890'; // 替换为你的合约地址
export const USDC_ADDRESS = '0xA0b86a33E6417c18BD0bd6Dc3E73E0C82D906Db7'; // Sepolia测试网的USDC地址

// 简化的合约ABI
export const TUITION_ESCROW_ABI = [
  'function initialize(address payer, address university, uint256 amount, string calldata invoiceRef) external',
  'function deposit(string calldata invoiceRef, uint256 amount) external',
  'function release(string calldata invoiceRef) external',
  'function refund(string calldata invoiceRef) external',
  'function getEscrowInfo(string calldata invoiceRef) external view returns (tuple(address payer, address university, uint256 amount, string invoiceRef, uint8 status))',
  'function getEscrowStatus(string calldata invoiceRef) external view returns (uint8)',
  'event Deposited(string indexed invoiceRef, address indexed payer, address indexed university, uint256 amount)',
  'event Released(string indexed invoiceRef, address indexed university, uint256 amount)',
  'event Refunded(string indexed invoiceRef, address indexed payer, uint256 amount)'
];

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)'
];

// 连接钱包
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('请安装 MetaMask 钱包');
  }

  try {
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await browserProvider.send('eth_requestAccounts', []);
    
    if (accounts.length === 0) {
      throw new Error('没有可用的账户');
    }

    const userSigner = await browserProvider.getSigner();
    const address = await userSigner.getAddress();

    // 检查网络是否为Sepolia
    const network = await browserProvider.getNetwork();
    if (network.chainId !== 11155111n) { // Sepolia chainId
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }], // Sepolia chainId in hex
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          // 如果网络不存在，添加Sepolia网络
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0xaa36a7',
              chainName: 'Sepolia Test Network',
              nativeCurrency: {
                name: 'ETH',
                symbol: 'ETH',
                decimals: 18
              },
              rpcUrls: ['https://sepolia.infura.io/v3/YOUR_INFURA_KEY'],
              blockExplorerUrls: ['https://sepolia.etherscan.io/']
            }]
          });
        } else {
          throw switchError;
        }
      }
    }

    provider.set(browserProvider);
    signer.set(userSigner);
    walletAddress.set(address);
    isConnected.set(true);

    return { address, provider: browserProvider, signer: userSigner };
  } catch (error) {
    console.error('连接钱包失败:', error);
    throw error;
  }
}

// 断开钱包连接
export function disconnectWallet() {
  provider.set(null);
  signer.set(null);
  walletAddress.set('');
  isConnected.set(false);
}

// 获取合约实例
export function getEscrowContract(signerInstance?: ethers.JsonRpcSigner) {
  if (!signerInstance) {
    throw new Error('需要连接钱包');
  }
  return new ethers.Contract(CONTRACT_ADDRESS, TUITION_ESCROW_ABI, signerInstance);
}

// 获取USDC合约实例
export function getUSDCContract(signerInstance?: ethers.JsonRpcSigner) {
  if (!signerInstance) {
    throw new Error('需要连接钱包');
  }
  return new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signerInstance);
}

// 格式化地址显示
export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// 解析金额 (USDC有6位小数)
export function parseUSDC(amount: string): bigint {
  return ethers.parseUnits(amount, 6);
}

// 格式化金额显示
export function formatUSDC(amount: bigint): string {
  return ethers.formatUnits(amount, 6);
}
