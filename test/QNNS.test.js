const { describe, it, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const quais = require("quais");

const QNNSJson = require("../artifacts/contracts/QNNS.sol/QNNS.json");

// ============ Config ============

const RPC_URL = "http://127.0.0.1:8545";
const MIN_AUCTION_PRICE_QI = quais.parseQuai("1000");
const MIN_LOCK_AMOUNT_QI = quais.parseQuai("1000");
const EXCHANGE_RATE = quais.parseQuai("1"); // 1:1 for testing
const PRECOMPILE_ADDRESS = "0x000000000000000000000000000000000000000B";
// Bytecode: PUSH1 0x00, SLOAD, PUSH1 0x00, MSTORE, PUSH1 0x20, PUSH1 0x00, RETURN
const EXCHANGE_RATE_BYTECODE = "0x60005460005260206000f3";
const AUCTION_DURATION = 72 * 3600; // 72 hours in seconds

// ============ Helpers ============

function hashName(name) {
  return quais.keccak256(quais.solidityPacked(["string"], [name]));
}

async function setupProvider() {
  return new quais.JsonRpcProvider(RPC_URL, undefined, { usePathing: false });
}

async function getSigners(provider) {
  const accounts = await provider.send("eth_accounts", []);
  return accounts.map((addr) => new quais.Wallet(addr, provider));
}

async function getSignersWithKey(provider) {
  // Hardhat default accounts private keys
  const keys = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  ];
  return keys.map((key) => new quais.Wallet(key, provider));
}

async function setupExchangeRatePrecompile(provider, rate) {
  await provider.send("hardhat_setCode", [
    PRECOMPILE_ADDRESS,
    EXCHANGE_RATE_BYTECODE,
  ]);
  const rateHex = quais.zeroPadValue(quais.toBeHex(rate), 32);
  await provider.send("hardhat_setStorageAt", [
    PRECOMPILE_ADDRESS,
    "0x0",
    rateHex,
  ]);
}

async function deployQNNS(signer) {
  const factory = new quais.ContractFactory(
    QNNSJson.abi,
    QNNSJson.bytecode,
    signer
  );
  const contract = await factory.deploy(MIN_AUCTION_PRICE_QI, MIN_LOCK_AMOUNT_QI);
  await contract.waitForDeployment();
  return contract;
}

async function increaseTime(provider, seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

async function startAndFinalizeAuction(qnns, name, bidAmount, lockAmount, signer, provider) {
  const nameHash = hashName(name);

  const tx = await qnns.connect(signer).startAuction(name, { value: bidAmount });
  const receipt = await tx.wait();

  // Parse AuctionStarted event to get auction ID
  let auctionId;
  for (const log of receipt.logs) {
    try {
      const parsed = qnns.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed && parsed.name === "AuctionStarted") {
        auctionId = parsed.args[0];
        break;
      }
    } catch {}
  }

  // Fast forward past auction duration
  await increaseTime(provider, AUCTION_DURATION + 1);

  // Finalize
  await qnns.connect(signer).finalizeAuction(
    auctionId,
    await signer.getAddress(),
    "",
    { value: lockAmount }
  );

  return { nameHash, auctionId };
}

// ============ Tests ============

describe("QNNS", () => {
  let provider;
  let signers;
  let deployer, user1, user2, user3;
  let qnns;

  before(async () => {
    provider = await setupProvider();
    signers = await getSignersWithKey(provider);
    [deployer, user1, user2, user3] = signers;
  });

  beforeEach(async () => {
    // Reset hardhat network state
    await provider.send("hardhat_reset", []);

    // Set up exchange rate precompile mock
    await setupExchangeRatePrecompile(provider, EXCHANGE_RATE);

    // Deploy QNNS
    qnns = await deployQNNS(deployer);
  });

  // ============ Exchange Rate ============

  describe("Exchange Rate", () => {
    it("should read exchange rate from precompile", async () => {
      const rate = await qnns.getExchangeRate();
      assert.equal(rate, EXCHANGE_RATE);
    });

    it("should calculate min auction price in QUAI", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      assert.equal(minPrice, quais.parseQuai("1000"));
    });

    it("should calculate min lock amount in QUAI", async () => {
      const minLock = await qnns.getMinLockAmountQuai();
      assert.equal(minLock, quais.parseQuai("1000"));
    });

    it("should reflect exchange rate changes", async () => {
      await setupExchangeRatePrecompile(provider, quais.parseQuai("2"));
      const minPrice = await qnns.getMinAuctionPriceQuai();
      assert.equal(minPrice, quais.parseQuai("2000"));
    });
  });

  // ============ Auction — Start ============

  describe("Auction — Start", () => {
    it("should start an auction with valid name and bid", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const tx = await qnns.connect(user1).startAuction("alice", { value: minPrice });
      const receipt = await tx.wait();
      assert.ok(receipt.status === 1);
    });

    it("should reject invalid names", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      await assert.rejects(
        qnns.connect(user1).startAuction("", { value: minPrice }),
        /InvalidName|revert/
      );
      await assert.rejects(
        qnns.connect(user1).startAuction("UPPERCASE", { value: minPrice }),
        /InvalidName|revert/
      );
    });

    it("should reject bids below minimum", async () => {
      await assert.rejects(
        qnns.connect(user1).startAuction("alice", { value: quais.parseQuai("100") }),
        /InsufficientBid|revert/
      );
    });

    it("should reject auction for blocked name", async () => {
      const nameHash = hashName("blocked-name");
      await qnns.adminBlock([nameHash]);
      const minPrice = await qnns.getMinAuctionPriceQuai();
      await assert.rejects(
        qnns.connect(user1).startAuction("blocked-name", { value: minPrice }),
        /NameIsBlocked|revert/
      );
    });

    it("should reject auction for reserved name", async () => {
      const nameHash = hashName("reserved-name");
      await qnns.adminReserve([nameHash]);
      const minPrice = await qnns.getMinAuctionPriceQuai();
      await assert.rejects(
        qnns.connect(user1).startAuction("reserved-name", { value: minPrice }),
        /NameReservedByAdmin|revert/
      );
    });

    it("should reject auction for already registered name", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);

      await assert.rejects(
        qnns.connect(user2).startAuction("alice", { value: minPrice }),
        /NameAlreadyRegistered|revert/
      );
    });

    it("should reject duplicate active auctions", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      await qnns.connect(user1).startAuction("alice", { value: minPrice });
      await assert.rejects(
        qnns.connect(user2).startAuction("alice", { value: minPrice }),
        /AuctionAlreadyExists|revert/
      );
    });
  });

  // ============ Auction — Bidding ============

  describe("Auction — Bidding", () => {
    let auctionId;
    const minPrice = quais.parseQuai("1000");

    beforeEach(async () => {
      const tx = await qnns.connect(user1).startAuction("alice", { value: minPrice });
      const receipt = await tx.wait();
      for (const log of receipt.logs) {
        try {
          const parsed = qnns.interface.parseLog({ topics: log.topics, data: log.data });
          if (parsed && parsed.name === "AuctionStarted") {
            auctionId = parsed.args[0];
            break;
          }
        } catch {}
      }
    });

    it("should accept higher bid and refund previous bidder", async () => {
      const prevBalance = await provider.getBalance(await user1.getAddress());
      const higherBid = minPrice + quais.parseQuai("500");

      await qnns.connect(user2).bid(auctionId, { value: higherBid });

      const auction = await qnns.getAuction(auctionId);
      assert.equal(auction.highestBidder, await user2.getAddress());
      assert.equal(auction.highestBid, higherBid);

      // Previous bidder should get refund
      const newBalance = await provider.getBalance(await user1.getAddress());
      assert.ok(newBalance > prevBalance);
    });

    it("should reject bid not exceeding current highest", async () => {
      await assert.rejects(
        qnns.connect(user2).bid(auctionId, { value: minPrice }),
        /BidTooLow|revert/
      );
    });

    it("should extend auction on anti-snipe bid", async () => {
      // Advance to 1 second before end
      await increaseTime(provider, AUCTION_DURATION - 1);

      const auctionBefore = await qnns.getAuction(auctionId);
      const endTimeBefore = auctionBefore.endTime;

      const higherBid = minPrice + quais.parseQuai("100");
      await qnns.connect(user2).bid(auctionId, { value: higherBid });

      const auctionAfter = await qnns.getAuction(auctionId);
      assert.ok(auctionAfter.endTime > endTimeBefore);
    });
  });

  // ============ Auction — Finalization ============

  describe("Auction — Finalization", () => {
    let auctionId;
    const minPrice = quais.parseQuai("1000");

    beforeEach(async () => {
      const tx = await qnns.connect(user1).startAuction("alice", { value: minPrice });
      const receipt = await tx.wait();
      for (const log of receipt.logs) {
        try {
          const parsed = qnns.interface.parseLog({ topics: log.topics, data: log.data });
          if (parsed && parsed.name === "AuctionStarted") {
            auctionId = parsed.args[0];
            break;
          }
        } catch {}
      }
    });

    it("should finalize auction and mint NFT to winner", async () => {
      await increaseTime(provider, AUCTION_DURATION + 1);
      const minLock = await qnns.getMinLockAmountQuai();
      await qnns.connect(user1).finalizeAuction(auctionId, await user1.getAddress(), "", { value: minLock });

      const nameHash = hashName("alice");
      assert.equal(await qnns.isRegistered(nameHash), true);
      assert.equal(await qnns.ownerOf(BigInt(nameHash)), await user1.getAddress());
    });

    it("should send 1% to deployer and rest to burn", async () => {
      await increaseTime(provider, AUCTION_DURATION + 1);

      const deployerAddr = await deployer.getAddress();
      const burnAddress = await qnns.burnAddress();
      const deployerBalBefore = await provider.getBalance(deployerAddr);
      const burnBalBefore = await provider.getBalance(burnAddress);

      const minLock = await qnns.getMinLockAmountQuai();
      await qnns.connect(user1).finalizeAuction(auctionId, await user1.getAddress(), "", { value: minLock });

      const deployerBalAfter = await provider.getBalance(deployerAddr);
      const burnBalAfter = await provider.getBalance(burnAddress);

      const expectedFee = minPrice / 100n;
      assert.equal(deployerBalAfter - deployerBalBefore, expectedFee);
      assert.equal(burnBalAfter - burnBalBefore, minPrice - expectedFee);
    });

    it("should reject finalization before auction ends", async () => {
      const minLock = await qnns.getMinLockAmountQuai();
      await assert.rejects(
        qnns.connect(user1).finalizeAuction(auctionId, await user1.getAddress(), "", { value: minLock }),
        /AuctionNotEnded|revert/
      );
    });

    it("should reject insufficient lock deposit", async () => {
      await increaseTime(provider, AUCTION_DURATION + 1);
      await assert.rejects(
        qnns.connect(user1).finalizeAuction(auctionId, await user1.getAddress(), "", { value: quais.parseQuai("100") }),
        /InsufficientLockDeposit|revert/
      );
    });
  });

  // ============ Lock & Release ============

  describe("Lock & Release", () => {
    it("should return lock deposit on release", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      const { nameHash } = await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);

      const addr = await user1.getAddress();
      const balBefore = await provider.getBalance(addr);
      const tx = await qnns.connect(user1).release(nameHash);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await provider.getBalance(addr);

      assert.equal(balAfter + gasUsed - balBefore, minLock);
      assert.equal(await qnns.isRegistered(nameHash), false);
    });

    it("should allow re-auction after release", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      const { nameHash } = await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);

      await qnns.connect(user1).release(nameHash);

      // Should be able to start a new auction
      const tx = await qnns.connect(user2).startAuction("alice", { value: minPrice });
      const receipt = await tx.wait();
      assert.ok(receipt.status === 1);
    });
  });

  // ============ Multiple Names ============

  describe("Multiple Names", () => {
    it("should allow one address to own multiple names", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();

      const { nameHash: h1 } = await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);
      const { nameHash: h2 } = await startAndFinalizeAuction(qnns, "bob", minPrice, minLock, user1, provider);

      const addr = await user1.getAddress();
      assert.equal(await qnns.ownerOf(BigInt(h1)), addr);
      assert.equal(await qnns.ownerOf(BigInt(h2)), addr);
      assert.equal(await qnns.balanceOf(addr), 2n);
    });
  });

  // ============ Marketplace ============

  describe("Marketplace", () => {
    let nameHash;

    beforeEach(async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      const result = await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);
      nameHash = result.nameHash;
    });

    it("should place a bid on a registered name", async () => {
      const bidAmount = quais.parseQuai("2000");
      await qnns.connect(user2).placeBid(nameHash, { value: bidAmount });

      const bids = await qnns.getMarketplaceBids(nameHash);
      assert.equal(bids.length, 1);
      assert.equal(bids[0].bidder, await user2.getAddress());
      assert.equal(bids[0].amount, bidAmount);
    });

    it("should cancel a bid and return escrowed funds", async () => {
      const bidAmount = quais.parseQuai("2000");
      await qnns.connect(user2).placeBid(nameHash, { value: bidAmount });

      const addr = await user2.getAddress();
      const balBefore = await provider.getBalance(addr);
      const tx = await qnns.connect(user2).cancelBid(nameHash, 0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await provider.getBalance(addr);

      assert.equal(balAfter + gasUsed - balBefore, bidAmount);
    });

    it("should accept bid — transfer name and distribute funds", async () => {
      const bidAmount = quais.parseQuai("5000");
      await qnns.connect(user2).placeBid(nameHash, { value: bidAmount });

      const deployerAddr = await deployer.getAddress();
      const sellerAddr = await user1.getAddress();
      const deployerBalBefore = await provider.getBalance(deployerAddr);
      const sellerBalBefore = await provider.getBalance(sellerAddr);

      const tx = await qnns.connect(user1).acceptBid(nameHash, 0);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const deployerBalAfter = await provider.getBalance(deployerAddr);
      const sellerBalAfter = await provider.getBalance(sellerAddr);

      const expectedFee = bidAmount / 100n;
      assert.equal(deployerBalAfter - deployerBalBefore, expectedFee);
      assert.equal(sellerBalAfter + gasUsed - sellerBalBefore, bidAmount - expectedFee);
      assert.equal(await qnns.ownerOf(BigInt(nameHash)), await user2.getAddress());
    });
  });

  // ============ Transfer Fee ============

  describe("Transfer Fee", () => {
    let nameHash;

    beforeEach(async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      const result = await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);
      nameHash = result.nameHash;
    });

    it("should block direct transferFrom", async () => {
      await assert.rejects(
        qnns.connect(user1).transferFrom(await user1.getAddress(), await user2.getAddress(), BigInt(nameHash)),
        /TransferFeeRequired|revert/
      );
    });

    it("should transfer via transferName with fee", async () => {
      const minLock = await qnns.getMinLockAmountQuai();
      const minFee = minLock / 100n;

      const deployerAddr = await deployer.getAddress();
      const deployerBalBefore = await provider.getBalance(deployerAddr);

      await qnns.connect(user1).transferName(nameHash, await user2.getAddress(), { value: minFee });

      assert.equal(await qnns.ownerOf(BigInt(nameHash)), await user2.getAddress());

      const deployerBalAfter = await provider.getBalance(deployerAddr);
      assert.equal(deployerBalAfter - deployerBalBefore, minFee);
    });

    it("should reject transferName with insufficient fee", async () => {
      await assert.rejects(
        qnns.connect(user1).transferName(nameHash, await user2.getAddress(), { value: quais.parseQuai("1") }),
        /TransferFeeRequired|revert/
      );
    });
  });

  // ============ Profile Management ============

  describe("Profile Management", () => {
    let nameHash;

    beforeEach(async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      const result = await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);
      nameHash = result.nameHash;
    });

    it("should set quai address", async () => {
      const addr = await user2.getAddress();
      await qnns.connect(user1).setQuaiAddress(nameHash, addr);
      assert.equal(await qnns.getQuaiAddress(nameHash), addr);
    });

    it("should set avatar", async () => {
      const avatar = quais.randomBytes(100);
      await qnns.connect(user1).setAvatar(nameHash, avatar);
      const stored = await qnns.getAvatar(nameHash);
      assert.equal(stored, quais.hexlify(avatar));
    });

    it("should set profile fields", async () => {
      await qnns.connect(user1).setProfile(nameHash, "Alice", "Hello world", "https://alice.dev");
      const nd = await qnns.getNameData(nameHash);
      assert.equal(nd.displayName, "Alice");
      assert.equal(nd.description, "Hello world");
      assert.equal(nd.url, "https://alice.dev");
    });

    it("should set social links", async () => {
      await qnns.connect(user1).setSocials(nameHash, "@alice", "alice", "alice#1234", "@alice_tg");
      const nd = await qnns.getNameData(nameHash);
      assert.equal(nd.twitter, "@alice");
      assert.equal(nd.github, "alice");
    });

    it("should set nostr pubkey", async () => {
      const pubkey = "a".repeat(64);
      await qnns.connect(user1).setNostrPubkey(nameHash, pubkey);
      assert.equal(await qnns.getNostrPubkey(nameHash), pubkey);
    });

    it("should set content hash for IPFS lookup", async () => {
      const contentHash = quais.getBytes("0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e2a898ec68d135");
      await qnns.connect(user1).setContentHash(nameHash, contentHash);
      const stored = await qnns.getContentHash(nameHash);
      assert.equal(stored, quais.hexlify(contentHash));
    });

    it("should reject profile update by non-owner", async () => {
      await assert.rejects(
        qnns.connect(user2).setQuaiAddress(nameHash, await user2.getAddress()),
        /NotOwner|revert/
      );
    });
  });

  // ============ Admin Functions ============

  describe("Admin Functions", () => {
    it("should revoke a name and return lock", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      const { nameHash } = await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);

      const addr = await user1.getAddress();
      const balBefore = await provider.getBalance(addr);
      await qnns.adminRevoke(nameHash, "policy violation");
      const balAfter = await provider.getBalance(addr);

      assert.equal(await qnns.isRegistered(nameHash), false);
      assert.equal(balAfter - balBefore, minLock);
    });

    it("should assign a name directly", async () => {
      const nameHash = hashName("admin-name");
      const addr = await user1.getAddress();
      await qnns.adminAssign(nameHash, "admin-name", addr, addr, "");

      assert.equal(await qnns.isRegistered(nameHash), true);
      assert.equal(await qnns.ownerOf(BigInt(nameHash)), addr);
    });

    it("should reserve and unreserve names", async () => {
      const nameHash = hashName("reserved-test");
      await qnns.adminReserve([nameHash]);
      assert.equal(await qnns.reserved(nameHash), true);

      await qnns.adminUnreserve([nameHash]);
      assert.equal(await qnns.reserved(nameHash), false);
    });

    it("should block names", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      const { nameHash } = await startAndFinalizeAuction(qnns, "alice", minPrice, minLock, user1, provider);

      await qnns.adminBlock([nameHash]);
      assert.equal(await qnns.blocked(nameHash), true);
      assert.equal(await qnns.isRegistered(nameHash), false);
    });

    it("should update admin settings", async () => {
      await qnns.adminSetMinAuctionPriceQi(quais.parseQuai("2000"));
      assert.equal(await qnns.minAuctionPriceQi(), quais.parseQuai("2000"));

      await qnns.adminSetAuctionDuration(48 * 3600);
      assert.equal(await qnns.auctionDuration(), BigInt(48 * 3600));
    });

    it("should transfer admin role", async () => {
      const addr = await user1.getAddress();
      await qnns.adminSetAdmin(addr);
      assert.equal(await qnns.admin(), addr);

      await assert.rejects(
        qnns.adminSetAdmin(await deployer.getAddress()),
        /NotAdmin|revert/
      );
    });

    it("should reject admin actions from non-admin", async () => {
      await assert.rejects(
        qnns.connect(user1).adminSetAdmin(await user1.getAddress()),
        /NotAdmin|revert/
      );
    });
  });

  // ============ View Functions ============

  describe("View Functions", () => {
    it("should hash name correctly", async () => {
      const hash = await qnns.hashName("alice");
      assert.equal(hash, hashName("alice"));
    });

    it("should report availability correctly", async () => {
      assert.equal(await qnns.isAvailable("alice"), true);

      const minPrice = await qnns.getMinAuctionPriceQuai();
      await qnns.connect(user1).startAuction("alice", { value: minPrice });
      assert.equal(await qnns.isAvailable("alice"), false);
    });
  });

  // ============ ERC-721 ============

  describe("ERC-721 Compliance", () => {
    it("should return correct name and symbol", async () => {
      assert.equal(await qnns.name(), "Quai Network Name Service");
      assert.equal(await qnns.symbol(), "QNNS");
    });

    it("should track balance correctly", async () => {
      const minPrice = await qnns.getMinAuctionPriceQuai();
      const minLock = await qnns.getMinLockAmountQuai();
      const addr = await user1.getAddress();

      assert.equal(await qnns.balanceOf(addr), 0n);
      await startAndFinalizeAuction(qnns, "name1", minPrice, minLock, user1, provider);
      assert.equal(await qnns.balanceOf(addr), 1n);
      await startAndFinalizeAuction(qnns, "name2", minPrice, minLock, user1, provider);
      assert.equal(await qnns.balanceOf(addr), 2n);
    });

    it("should support ERC-721 interface", async () => {
      assert.equal(await qnns.supportsInterface("0x80ac58cd"), true);
    });
  });
});
