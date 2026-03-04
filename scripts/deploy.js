const quais = require('quais');
const { deployMetadata } = require("hardhat");
require('dotenv').config();

const QNNSJson = require('../artifacts/contracts/QNNS.sol/QNNS.json');

async function deployQNNS() {
  console.log('Starting deployment of QNNS v3 contract (hybrid registration)...\n');

  // Config provider and wallet
  const rpcUrl = process.env.RPC_URL || 'https://orchard.rpc.quai.network/cyprus1';
  const provider = new quais.JsonRpcProvider(rpcUrl, undefined, { usePathing: false });
  const wallet = new quais.Wallet(process.env.CYPRUS1_PK, provider);

  console.log('Deploying from address:', wallet.address);
  console.log('Wallet balance:', quais.formatQuai(await provider.getBalance(wallet.address)), 'QUAI');
  console.log('RPC URL:', rpcUrl);

  // Constructor params - QNNS v3 hybrid registration
  const registrationFee7Plus = quais.parseQuai('200');      // 200 QUAI flat fee for 7+ char instant registration
  const auctionFloor4to6 = quais.parseQuai('1000');         // 1000 QUAI minimum bid for 4-6 char auctions
  const auctionFloor1to3 = quais.parseQuai('5000');         // 5000 QUAI minimum bid for 1-3 char auctions
  const minLockAmount = quais.parseQuai('100');             // 100 QUAI minimum lock
  const quaiPerQi = quais.parseQuai('13.925');              // 13.925 QUAI per Qi
  const yearlyPriceQi5Plus = quais.parseQuai('4.33');       // ~$5/yr at $1.156/Qi
  const yearlyPriceQi4Char = quais.parseQuai('173');        // ~$200/yr
  const yearlyPriceQi3OrLess = quais.parseQuai('865');      // ~$1000/yr

  console.log('\n=== Deploying QNNS v3 Contract (Hybrid Registration) ===');
  console.log('Registration fee (7+ chars):', quais.formatQuai(registrationFee7Plus), 'QUAI');
  console.log('Auction floor (4-6 chars):', quais.formatQuai(auctionFloor4to6), 'QUAI');
  console.log('Auction floor (1-3 chars):', quais.formatQuai(auctionFloor1to3), 'QUAI');
  console.log('Min lock amount:', quais.formatQuai(minLockAmount), 'QUAI');
  console.log('QUAI per Qi:', quais.formatQuai(quaiPerQi));
  console.log('Yearly price (5+ chars):', quais.formatQuai(yearlyPriceQi5Plus), 'Qi (~$5/yr)');
  console.log('Yearly price (4 chars):', quais.formatQuai(yearlyPriceQi4Char), 'Qi');
  console.log('Yearly price (≤3 chars):', quais.formatQuai(yearlyPriceQi3OrLess), 'Qi');

  try {
    const ipfsHash = await deployMetadata.pushMetadataToIPFS("QNNS");
    const QNNSFactory = new quais.ContractFactory(
      QNNSJson.abi,
      QNNSJson.bytecode,
      wallet,
      ipfsHash
    );

    const qnns = await QNNSFactory.deploy(
      registrationFee7Plus,
      auctionFloor4to6,
      auctionFloor1to3,
      minLockAmount,
      quaiPerQi,
      yearlyPriceQi5Plus,
      yearlyPriceQi4Char,
      yearlyPriceQi3OrLess
    );

    console.log('QNNS deployment transaction:', qnns.deploymentTransaction().hash);
    await qnns.waitForDeployment();
    const contractAddress = await qnns.getAddress();
    console.log('QNNS deployed to:', contractAddress);

    console.log('\n=== Deployment Successful ===');
    console.log('QNNS Contract Address:', contractAddress);
    console.log('\nUpdate .env with:');
    console.log('QNNS_CONTRACT=' + contractAddress);

    return contractAddress;

  } catch (error) {
    console.error('Error deploying QNNS:', error.message);
    throw error;
  }
}

deployQNNS()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
