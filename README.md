# usdc 支付demo

## 需求

已经在 sepolia 测试网上部署了一个 `TuitionEscrow` 合约，用于学生使用USDC交学费

分两个页面

学生访问 /student 页面，这个页面展示一个表单，学生输入学费金额和发票编号，点击按钮唤起钱包签名交易

管理员访问 /admin 页面，这个页面展示一个列表，取出所有已经申请转学费的交易，右侧有2个按钮，管理员点击可以确认交费和退款

## 技术栈

- svelte v5 + sveltekit
- tailwindcss v4
- daisyui
- ethers v6
