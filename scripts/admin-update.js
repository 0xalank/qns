const quais = require('quais');
require('dotenv').config();

const QNNSJson = require('../artifacts/contracts/QNNS.sol/QNNS.json');

async function updateParams() {
  const rpcUrl = process.env.RPC_URL || 'https://orchard.rpc.quai.network/cyprus1';
  const provider = new quais.JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const wallet = new quais.Wallet(process.env.CYPRUS1_PK, provider);

  // UPDATE THIS to your deployed contract address
  const contractAddress = process.env.QNNS_CONTRACT || '';

  if (!contractAddress) {
    console.error('Set QNNS_CONTRACT in .env to your deployed contract address');
    process.exit(1);
  }

  console.log('Admin wallet:', wallet.address);
  console.log('Contract:', contractAddress);

  const contract = new quais.Contract(contractAddress, QNNSJson.abi, wallet);

  // 1. Set minimum auction price to 200 QUAI
  console.log('\nSetting min auction price to 200 QUAI...');
  const tx1 = await contract.adminSetMinAuctionPrice(quais.parseQuai('200'));
  await tx1.wait();
  console.log('Done. Tx:', tx1.hash);

  // 2. Set auction duration to 10 minutes
  console.log('\nSetting auction duration to 10 minutes...');
  const tx2 = await contract.adminSetAuctionDuration(600); // 10 minutes in seconds
  await tx2.wait();
  console.log('Done. Tx:', tx2.hash);

  // 3. Set anti-snipe window to 1 hour
  console.log('\nSetting anti-snipe window to 1 hour...');
  const tx3 = await contract.adminSetAntiSnipeWindow(3600); // 1 hour in seconds
  await tx3.wait();
  console.log('Done. Tx:', tx3.hash);

  // Verify
  console.log('\n=== Current Settings ===');
  console.log('Min auction price:', quais.formatQuai(await contract.minAuctionPrice()), 'QUAI');
  console.log('Auction duration:', (await contract.auctionDuration()).toString(), 'seconds');
  console.log('Anti-snipe window:', (await contract.antiSnipeWindow()).toString(), 'seconds');

  console.log('\nAdmin update complete!');
}

updateParams()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
