import { expect } from "chai";
import { ethers } from "hardhat";

describe("QNNS", function () {
  let qnns: any;
  let deployer: any;
  let admin: any;
  let user1: any;
  let user2: any;
  let user3: any;

  // Constructor params (flat QUAI values)
  const MIN_AUCTION_PRICE = ethers.parseEther("1000");
  const MIN_LOCK_AMOUNT = ethers.parseEther("500");
  const QUAI_PER_QI = ethers.parseEther("1"); // 1:1 for simple test math
  const YEARLY_PRICE_QI_5PLUS = ethers.parseEther("10");   // 10 Qi → 10 QUAI at 1:1
  const YEARLY_PRICE_QI_4CHAR = ethers.parseEther("200");   // 200 Qi → 200 QUAI at 1:1
  const YEARLY_PRICE_QI_3ORLESS = ethers.parseEther("1000"); // 1000 Qi → 1000 QUAI at 1:1

  // Computed yearly prices in QUAI (at 1:1 rate)
  const YEARLY_5PLUS = ethers.parseEther("10");
  const YEARLY_4CHAR = ethers.parseEther("200");
  const YEARLY_3ORLESS = ethers.parseEther("1000");

  const AUCTION_DURATION = 12 * 3600; // 12 hours
  const ANTI_SNIPE_WINDOW = 3600;     // 1 hour
  const GRACE_PERIOD = 30 * 24 * 3600; // 30 days
  const ONE_YEAR = 365 * 24 * 3600;    // 365 days

  function hashName(name: string): string {
    return ethers.keccak256(ethers.solidityPacked(["string"], [name]));
  }

  async function startAndFinalizeAuction(
    name: string,
    bidAmount: bigint,
    payment: bigint,
    signer: any
  ): Promise<{ nameHash: string; auctionId: bigint }> {
    const nameHash = hashName(name);
    const tx = await qnns.connect(signer).startAuction(name, { value: bidAmount });
    const receipt = await tx.wait();

    const event = receipt?.logs.find(
      (log: any) => {
        try {
          return qnns.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "AuctionStarted";
        } catch { return false; }
      }
    );
    const parsed = qnns.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
    const auctionId = parsed!.args[0];

    // Fast forward past auction duration (12 hours)
    await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);

    // Finalize with lock + yearly fee
    await qnns.connect(signer).finalizeAuction(
      auctionId,
      signer.address,
      "",
      { value: payment }
    );

    return { nameHash, auctionId };
  }

  // Helper: get required payment for finalization (lock + yearly fee by name length)
  function getRequiredPayment(name: string): bigint {
    const len = name.length;
    let yearlyFee: bigint;
    if (len <= 3) yearlyFee = YEARLY_3ORLESS;
    else if (len === 4) yearlyFee = YEARLY_4CHAR;
    else yearlyFee = YEARLY_5PLUS;
    return MIN_LOCK_AMOUNT + yearlyFee;
  }

  beforeEach(async function () {
    [deployer, admin, user1, user2, user3] = await ethers.getSigners();

    const QNNS = await ethers.getContractFactory("QNNS");
    qnns = await QNNS.deploy(
      MIN_AUCTION_PRICE,
      MIN_LOCK_AMOUNT,
      QUAI_PER_QI,
      YEARLY_PRICE_QI_5PLUS,
      YEARLY_PRICE_QI_4CHAR,
      YEARLY_PRICE_QI_3ORLESS
    );
    await qnns.waitForDeployment();
  });

  // ============ Pricing ============

  describe("Pricing", function () {
    it("should return correct yearly price for 5+ char names", async function () {
      const price = await qnns.getYearlyPriceQuaiByLength(5);
      expect(price).to.equal(YEARLY_5PLUS);
    });

    it("should return correct yearly price for 4 char names", async function () {
      const price = await qnns.getYearlyPriceQuaiByLength(4);
      expect(price).to.equal(YEARLY_4CHAR);
    });

    it("should return correct yearly price for 3 or fewer char names", async function () {
      const price3 = await qnns.getYearlyPriceQuaiByLength(3);
      expect(price3).to.equal(YEARLY_3ORLESS);

      const price2 = await qnns.getYearlyPriceQuaiByLength(2);
      expect(price2).to.equal(YEARLY_3ORLESS);

      const price1 = await qnns.getYearlyPriceQuaiByLength(1);
      expect(price1).to.equal(YEARLY_3ORLESS);
    });

    it("should scale with exchange rate", async function () {
      // Set quaiPerQi to 2 (double)
      await qnns.adminSetQuaiPerQi(ethers.parseEther("2"));
      const price = await qnns.getYearlyPriceQuaiByLength(5);
      // 10 Qi * 2 QUAI/Qi = 20 QUAI
      expect(price).to.equal(ethers.parseEther("20"));
    });

    it("should return min auction price", async function () {
      expect(await qnns.minAuctionPrice()).to.equal(MIN_AUCTION_PRICE);
    });

    it("should return min lock amount", async function () {
      expect(await qnns.minLockAmount()).to.equal(MIN_LOCK_AMOUNT);
    });
  });

  // ============ Auction Lifecycle ============

  describe("Auction — Start", function () {
    it("should start an auction with valid name and bid", async function () {
      const tx = await qnns.connect(user1).startAuction("alice", { value: MIN_AUCTION_PRICE });
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return qnns.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "AuctionStarted";
        } catch { return false; }
      });
      expect(event).to.not.be.undefined;
    });

    it("should reject invalid names", async function () {
      await expect(
        qnns.connect(user1).startAuction("", { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "InvalidName");

      await expect(
        qnns.connect(user1).startAuction("UPPERCASE", { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "InvalidName");

      await expect(
        qnns.connect(user1).startAuction("has space", { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "InvalidName");
    });

    it("should reject bids below minimum", async function () {
      await expect(
        qnns.connect(user1).startAuction("alice", { value: ethers.parseEther("100") })
      ).to.be.revertedWithCustomError(qnns, "InsufficientBid");
    });

    it("should reject auction for blocked name", async function () {
      const nameHash = hashName("blocked-name");
      await qnns.adminBlock([nameHash]);

      await expect(
        qnns.connect(user1).startAuction("blocked-name", { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "NameIsBlocked");
    });

    it("should reject auction for reserved name", async function () {
      const nameHash = hashName("reserved-name");
      await qnns.adminReserve([nameHash]);

      await expect(
        qnns.connect(user1).startAuction("reserved-name", { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "NameReservedByAdmin");
    });

    it("should reject auction for already registered name", async function () {
      const payment = getRequiredPayment("alice");
      await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      await expect(
        qnns.connect(user2).startAuction("alice", { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "NameAlreadyRegistered");
    });

    it("should reject duplicate active auctions for same name", async function () {
      await qnns.connect(user1).startAuction("alice", { value: MIN_AUCTION_PRICE });

      await expect(
        qnns.connect(user2).startAuction("alice", { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "AuctionAlreadyExists");
    });
  });

  describe("Auction — Bidding", function () {
    let auctionId: bigint;

    beforeEach(async function () {
      const tx = await qnns.connect(user1).startAuction("alice", { value: MIN_AUCTION_PRICE });
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return qnns.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "AuctionStarted";
        } catch { return false; }
      });
      const parsed = qnns.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
      auctionId = parsed!.args[0];
    });

    it("should accept higher bid and refund previous bidder", async function () {
      const prevBalance = await ethers.provider.getBalance(user1.address);
      const higherBid = MIN_AUCTION_PRICE + ethers.parseEther("500");

      await qnns.connect(user2).bid(auctionId, { value: higherBid });

      const auction = await qnns.getAuction(auctionId);
      expect(auction.highestBidder).to.equal(user2.address);
      expect(auction.highestBid).to.equal(higherBid);

      const newBalance = await ethers.provider.getBalance(user1.address);
      expect(newBalance).to.be.gt(prevBalance);
    });

    it("should reject bid not exceeding current highest", async function () {
      await expect(
        qnns.connect(user2).bid(auctionId, { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "BidTooLow");
    });

    it("should reject bid on finalized auction", async function () {
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const payment = getRequiredPayment("alice");
      await qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: payment });

      await expect(
        qnns.connect(user2).bid(auctionId, { value: MIN_AUCTION_PRICE * 2n })
      ).to.be.revertedWithCustomError(qnns, "AuctionAlreadyFinalized");
    });

    it("should extend auction on anti-snipe bid", async function () {
      // Advance to 1 second before end
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION - 1]);
      await ethers.provider.send("evm_mine", []);

      const auctionBefore = await qnns.getAuction(auctionId);
      const endTimeBefore = auctionBefore.endTime;

      const higherBid = MIN_AUCTION_PRICE + ethers.parseEther("100");
      await qnns.connect(user2).bid(auctionId, { value: higherBid });

      const auctionAfter = await qnns.getAuction(auctionId);
      expect(auctionAfter.endTime).to.be.gt(endTimeBefore);
    });

    it("should reject bid after auction end time", async function () {
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        qnns.connect(user2).bid(auctionId, { value: MIN_AUCTION_PRICE * 2n })
      ).to.be.revertedWithCustomError(qnns, "AuctionNotEnded");
    });
  });

  describe("Auction — Finalization", function () {
    let auctionId: bigint;

    beforeEach(async function () {
      const tx = await qnns.connect(user1).startAuction("alice", { value: MIN_AUCTION_PRICE });
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return qnns.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "AuctionStarted";
        } catch { return false; }
      });
      const parsed = qnns.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
      auctionId = parsed!.args[0];
    });

    it("should finalize auction and mint NFT to winner", async function () {
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const payment = getRequiredPayment("alice");
      await qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: payment });

      const nameHash = hashName("alice");
      expect(await qnns.isRegistered(nameHash)).to.be.true;
      expect(await qnns.ownerOf(BigInt(nameHash))).to.equal(user1.address);
    });

    it("should set expiresAt to 1 year from finalization", async function () {
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const payment = getRequiredPayment("alice");
      await qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: payment });

      const nameHash = hashName("alice");
      const nd = await qnns.getNameData(nameHash);
      const block = await ethers.provider.getBlock("latest");
      // expiresAt should be ~365 days from now
      expect(nd.expiresAt).to.equal(BigInt(block!.timestamp) + BigInt(ONE_YEAR));
    });

    it("should send 1% to deployer and 99% to burn on winning bid", async function () {
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const deployerBalBefore = await ethers.provider.getBalance(deployer.address);
      const burnAddress = await qnns.burnAddress();
      const burnBalBefore = await ethers.provider.getBalance(burnAddress);

      const payment = getRequiredPayment("alice");
      await qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: payment });

      const deployerBalAfter = await ethers.provider.getBalance(deployer.address);
      const burnBalAfter = await ethers.provider.getBalance(burnAddress);

      // Both winning bid and yearly fee are distributed
      const yearlyFee = YEARLY_5PLUS; // "alice" is 5 chars
      const totalDistributed = MIN_AUCTION_PRICE + yearlyFee;
      const expectedFee = totalDistributed / 100n;
      const expectedBurn = totalDistributed - expectedFee;

      expect(deployerBalAfter - deployerBalBefore).to.equal(expectedFee);
      expect(burnBalAfter - burnBalBefore).to.equal(expectedBurn);
    });

    it("should reject finalization before auction ends", async function () {
      const payment = getRequiredPayment("alice");
      await expect(
        qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: payment })
      ).to.be.revertedWithCustomError(qnns, "AuctionNotEnded");
    });

    it("should reject insufficient payment (less than lock + yearly fee)", async function () {
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: ethers.parseEther("100") })
      ).to.be.revertedWithCustomError(qnns, "InsufficientPayment");
    });

    it("should reject double finalization", async function () {
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const payment = getRequiredPayment("alice");
      await qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: payment });

      await expect(
        qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: payment })
      ).to.be.revertedWithCustomError(qnns, "AuctionAlreadyFinalized");
    });

    it("should set name data correctly after finalization", async function () {
      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      const payment = getRequiredPayment("alice");
      await qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: payment });

      const nameHash = hashName("alice");
      const nd = await qnns.getNameData(nameHash);
      expect(nd.name).to.equal("alice");
      // Lock = payment - yearlyFee
      expect(nd.lockAmount).to.equal(payment - YEARLY_5PLUS);
      expect(nd.quaiAddress).to.equal(user1.address);
    });
  });

  // ============ Renewal ============

  describe("Renewal", function () {
    let nameHash: string;

    beforeEach(async function () {
      const payment = getRequiredPayment("alice");
      const result = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);
      nameHash = result.nameHash;
    });

    it("should renew a name by paying yearly fee", async function () {
      const expiryBefore = await qnns.getExpiresAt(nameHash);

      await qnns.connect(user2).renew(nameHash, { value: YEARLY_5PLUS });

      const expiryAfter = await qnns.getExpiresAt(nameHash);
      // Expiry should extend by 1 year from previous expiry (since not yet expired)
      expect(expiryAfter).to.equal(expiryBefore + BigInt(ONE_YEAR));
    });

    it("should allow anyone to renew (gift renewal)", async function () {
      // user2 renews user1's name
      await expect(
        qnns.connect(user2).renew(nameHash, { value: YEARLY_5PLUS })
      ).to.not.be.reverted;
    });

    it("should refund excess payment on renew", async function () {
      const excess = ethers.parseEther("50");
      const balBefore = await ethers.provider.getBalance(user1.address);
      const tx = await qnns.connect(user1).renew(nameHash, { value: YEARLY_5PLUS + excess });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user1.address);

      // Should only lose the yearly fee + gas
      expect(balBefore - balAfter - gasUsed).to.equal(YEARLY_5PLUS);
    });

    it("should reject renewal with insufficient payment", async function () {
      await expect(
        qnns.connect(user1).renew(nameHash, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(qnns, "InsufficientPayment");
    });

    it("should stack renewal time from current expiry (not from now)", async function () {
      const expiryBefore = await qnns.getExpiresAt(nameHash);

      // Renew twice
      await qnns.connect(user1).renew(nameHash, { value: YEARLY_5PLUS });
      await qnns.connect(user1).renew(nameHash, { value: YEARLY_5PLUS });

      const expiryAfter = await qnns.getExpiresAt(nameHash);
      expect(expiryAfter).to.equal(expiryBefore + BigInt(ONE_YEAR) * 2n);
    });

    it("should distribute renewal fee: 99% burn, 1% deployer", async function () {
      const deployerBalBefore = await ethers.provider.getBalance(deployer.address);
      const burnAddress = await qnns.burnAddress();
      const burnBalBefore = await ethers.provider.getBalance(burnAddress);

      await qnns.connect(user2).renew(nameHash, { value: YEARLY_5PLUS });

      const deployerBalAfter = await ethers.provider.getBalance(deployer.address);
      const burnBalAfter = await ethers.provider.getBalance(burnAddress);

      const expectedFee = YEARLY_5PLUS / 100n;
      expect(deployerBalAfter - deployerBalBefore).to.equal(expectedFee);
      expect(burnBalAfter - burnBalBefore).to.equal(YEARLY_5PLUS - expectedFee);
    });

    it("should renew from lock deposit (owner only)", async function () {
      const ndBefore = await qnns.getNameData(nameHash);
      const lockBefore = ndBefore.lockAmount;
      const expiryBefore = ndBefore.expiresAt;

      await qnns.connect(user1).renewFromLock(nameHash);

      const ndAfter = await qnns.getNameData(nameHash);
      expect(ndAfter.lockAmount).to.equal(lockBefore - YEARLY_5PLUS);
      expect(ndAfter.expiresAt).to.equal(expiryBefore + BigInt(ONE_YEAR));
    });

    it("should reject renewFromLock by non-owner", async function () {
      await expect(
        qnns.connect(user2).renewFromLock(nameHash)
      ).to.be.revertedWithCustomError(qnns, "NotOwner");
    });

    it("should reject renewFromLock if lock is insufficient", async function () {
      // Drain the lock by renewing multiple times
      // lock = 500 QUAI, yearly fee = 10 QUAI for "alice" (5+ chars)
      // So we can renew 50 times from lock, then it should fail
      // Let's set a high yearly price first via admin
      await qnns.adminSetYearlyPriceQi5Plus(ethers.parseEther("600"));
      // Now yearly fee = 600 Qi * 1 QUAI/Qi = 600 QUAI, lock is 500 QUAI

      await expect(
        qnns.connect(user1).renewFromLock(nameHash)
      ).to.be.revertedWithCustomError(qnns, "InsufficientLockForRenewal");
    });

    it("should allow renewal during grace period", async function () {
      // Fast forward past expiry but within grace period
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await qnns.isInGracePeriod(nameHash)).to.be.true;

      // Should still be able to renew
      await expect(
        qnns.connect(user1).renew(nameHash, { value: YEARLY_5PLUS })
      ).to.not.be.reverted;

      expect(await qnns.isActive(nameHash)).to.be.true;
    });
  });

  // ============ Expiry & Grace Period ============

  describe("Expiry & Grace Period", function () {
    let nameHash: string;

    beforeEach(async function () {
      const payment = getRequiredPayment("alice");
      const result = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);
      nameHash = result.nameHash;
    });

    it("should report name as active before expiry", async function () {
      expect(await qnns.isActive(nameHash)).to.be.true;
      expect(await qnns.isInGracePeriod(nameHash)).to.be.false;
      expect(await qnns.isExpired(nameHash)).to.be.false;
    });

    it("should report name as in grace period after expiry", async function () {
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await qnns.isActive(nameHash)).to.be.false;
      expect(await qnns.isInGracePeriod(nameHash)).to.be.true;
      expect(await qnns.isExpired(nameHash)).to.be.false;
    });

    it("should report name as expired after grace period", async function () {
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + GRACE_PERIOD + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await qnns.isActive(nameHash)).to.be.false;
      expect(await qnns.isInGracePeriod(nameHash)).to.be.false;
      expect(await qnns.isExpired(nameHash)).to.be.true;
    });

    it("should expire name and return lock after grace period", async function () {
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + GRACE_PERIOD + 1]);
      await ethers.provider.send("evm_mine", []);

      const lockAmount = (await qnns.getNameData(nameHash)).lockAmount;
      const balBefore = await ethers.provider.getBalance(user1.address);

      await qnns.connect(user2).expireName(nameHash);

      const balAfter = await ethers.provider.getBalance(user1.address);
      expect(balAfter - balBefore).to.equal(lockAmount);
      expect(await qnns.isRegistered(nameHash)).to.be.false;
    });

    it("should reject expireName before grace period ends", async function () {
      // Still active
      await expect(
        qnns.connect(user2).expireName(nameHash)
      ).to.be.revertedWithCustomError(qnns, "NameNotExpired");

      // In grace period
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        qnns.connect(user2).expireName(nameHash)
      ).to.be.revertedWithCustomError(qnns, "NameNotExpired");
    });

    it("should allow new auction after name is expired", async function () {
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + GRACE_PERIOD + 1]);
      await ethers.provider.send("evm_mine", []);

      // Auto-expire via startAuction
      await expect(
        qnns.connect(user2).startAuction("alice", { value: MIN_AUCTION_PRICE })
      ).to.not.be.reverted;
    });

    it("should reject new auction during grace period", async function () {
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        qnns.connect(user2).startAuction("alice", { value: MIN_AUCTION_PRICE })
      ).to.be.revertedWithCustomError(qnns, "NameAlreadyRegistered");
    });

    it("should return correct time until expiry", async function () {
      const timeLeft = await qnns.getTimeUntilExpiry(nameHash);
      // Should be approximately ONE_YEAR (minus a few seconds for block time)
      expect(timeLeft).to.be.gt(BigInt(ONE_YEAR) - 100n);
      expect(timeLeft).to.be.lte(BigInt(ONE_YEAR));
    });

    it("should return 0 for time until expiry after expiry", async function () {
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await qnns.getTimeUntilExpiry(nameHash)).to.equal(0n);
    });
  });

  // ============ Lock & Release ============

  describe("Lock & Release", function () {
    it("should return lock deposit on release", async function () {
      const payment = getRequiredPayment("alice");
      const { nameHash } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);
      const lockAmount = payment - YEARLY_5PLUS; // lock = payment - yearlyFee

      const balBefore = await ethers.provider.getBalance(user1.address);
      const tx = await qnns.connect(user1).release(nameHash);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user1.address);

      expect(balAfter + gasUsed - balBefore).to.equal(lockAmount);
      expect(await qnns.isRegistered(nameHash)).to.be.false;
    });

    it("should burn NFT on release", async function () {
      const payment = getRequiredPayment("alice");
      const { nameHash } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      await qnns.connect(user1).release(nameHash);

      await expect(qnns.ownerOf(BigInt(nameHash)))
        .to.be.revertedWithCustomError(qnns, "ERC721NonexistentToken");
    });

    it("should allow re-auction after release", async function () {
      const payment = getRequiredPayment("alice");
      const { nameHash } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      await qnns.connect(user1).release(nameHash);

      await expect(
        qnns.connect(user2).startAuction("alice", { value: MIN_AUCTION_PRICE })
      ).to.not.be.reverted;
    });

    it("should reject release by non-owner", async function () {
      const payment = getRequiredPayment("alice");
      const { nameHash } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      await expect(
        qnns.connect(user2).release(nameHash)
      ).to.be.revertedWithCustomError(qnns, "NotOwner");
    });
  });

  // ============ Multiple Names Per Address ============

  describe("Multiple Names", function () {
    it("should allow one address to own multiple names", async function () {
      const payment5 = getRequiredPayment("alice");
      const { nameHash: hash1 } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment5, user1);
      const { nameHash: hash2 } = await startAndFinalizeAuction("bobby", MIN_AUCTION_PRICE, payment5, user1);

      expect(await qnns.ownerOf(BigInt(hash1))).to.equal(user1.address);
      expect(await qnns.ownerOf(BigInt(hash2))).to.equal(user1.address);
      expect(await qnns.balanceOf(user1.address)).to.equal(2n);
    });
  });

  // ============ Marketplace ============

  describe("Marketplace", function () {
    let nameHash: string;

    beforeEach(async function () {
      const payment = getRequiredPayment("alice");
      const result = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);
      nameHash = result.nameHash;
    });

    it("should place a bid on a registered name", async function () {
      const bidAmount = ethers.parseEther("2000");
      await qnns.connect(user2).placeBid(nameHash, { value: bidAmount });

      const bids = await qnns.getMarketplaceBids(nameHash);
      expect(bids.length).to.equal(1);
      expect(bids[0].bidder).to.equal(user2.address);
      expect(bids[0].amount).to.equal(bidAmount);
    });

    it("should allow multiple bids on same name", async function () {
      await qnns.connect(user2).placeBid(nameHash, { value: ethers.parseEther("2000") });
      await qnns.connect(user3).placeBid(nameHash, { value: ethers.parseEther("3000") });

      const bids = await qnns.getMarketplaceBids(nameHash);
      expect(bids.length).to.equal(2);
    });

    it("should cancel a bid and return escrowed funds", async function () {
      const bidAmount = ethers.parseEther("2000");
      await qnns.connect(user2).placeBid(nameHash, { value: bidAmount });

      const balBefore = await ethers.provider.getBalance(user2.address);
      const tx = await qnns.connect(user2).cancelBid(nameHash, 0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user2.address);

      expect(balAfter + gasUsed - balBefore).to.equal(bidAmount);
    });

    it("should reject cancellation by non-bidder", async function () {
      await qnns.connect(user2).placeBid(nameHash, { value: ethers.parseEther("2000") });

      await expect(
        qnns.connect(user3).cancelBid(nameHash, 0)
      ).to.be.revertedWithCustomError(qnns, "NotBidder");
    });

    it("should accept bid — transfer name and distribute funds with fee floor", async function () {
      const bidAmount = ethers.parseEther("5000");
      await qnns.connect(user2).placeBid(nameHash, { value: bidAmount });

      const deployerBalBefore = await ethers.provider.getBalance(deployer.address);
      const sellerBalBefore = await ethers.provider.getBalance(user1.address);

      const tx = await qnns.connect(user1).acceptBid(nameHash, 0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const deployerBalAfter = await ethers.provider.getBalance(deployer.address);
      const sellerBalAfter = await ethers.provider.getBalance(user1.address);

      // Fee = max(1% of sale, 1% of yearly rate)
      const saleFee = bidAmount / 100n;
      const yearlyFloor = YEARLY_5PLUS / 100n;
      const expectedFee = saleFee > yearlyFloor ? saleFee : yearlyFloor;

      expect(deployerBalAfter - deployerBalBefore).to.equal(expectedFee);

      const expectedProceeds = bidAmount - expectedFee;
      expect(sellerBalAfter + gasUsed - sellerBalBefore).to.equal(expectedProceeds);

      expect(await qnns.ownerOf(BigInt(nameHash))).to.equal(user2.address);
    });

    it("should keep lock with name after marketplace trade", async function () {
      const bidAmount = ethers.parseEther("5000");
      await qnns.connect(user2).placeBid(nameHash, { value: bidAmount });
      await qnns.connect(user1).acceptBid(nameHash, 0);

      const nd = await qnns.getNameData(nameHash);
      expect(nd.lockAmount).to.equal(MIN_LOCK_AMOUNT); // lock = payment - yearlyFee = 500
    });

    it("should reject accepting bid by non-owner", async function () {
      await qnns.connect(user2).placeBid(nameHash, { value: ethers.parseEther("2000") });

      await expect(
        qnns.connect(user3).acceptBid(nameHash, 0)
      ).to.be.revertedWithCustomError(qnns, "NotOwner");
    });

    it("should reject bid on unregistered name", async function () {
      const unregisteredHash = hashName("nonexistent");
      await expect(
        qnns.connect(user2).placeBid(unregisteredHash, { value: ethers.parseEther("1000") })
      ).to.be.revertedWithCustomError(qnns, "NameNotRegistered");
    });

    it("should reject accepting already cancelled bid", async function () {
      await qnns.connect(user2).placeBid(nameHash, { value: ethers.parseEther("2000") });
      await qnns.connect(user2).cancelBid(nameHash, 0);

      await expect(
        qnns.connect(user1).acceptBid(nameHash, 0)
      ).to.be.revertedWithCustomError(qnns, "BidNotFound");
    });
  });

  // ============ Transfer Fee Enforcement ============

  describe("Transfer Fee", function () {
    let nameHash: string;

    beforeEach(async function () {
      const payment = getRequiredPayment("alice");
      const result = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);
      nameHash = result.nameHash;
    });

    it("should block direct transferFrom", async function () {
      await expect(
        qnns.connect(user1).transferFrom(user1.address, user2.address, BigInt(nameHash))
      ).to.be.revertedWithCustomError(qnns, "TransferFeeRequired");
    });

    it("should block direct safeTransferFrom", async function () {
      await expect(
        qnns.connect(user1)["safeTransferFrom(address,address,uint256)"](
          user1.address, user2.address, BigInt(nameHash)
        )
      ).to.be.revertedWithCustomError(qnns, "TransferFeeRequired");
    });

    it("should transfer via transferName with fee (1% of yearly rate)", async function () {
      // Transfer fee = 1% of yearly rate for "alice" (5+ chars) = 10 * 1% = 0.1 QUAI
      const minFee = YEARLY_5PLUS / 100n;

      const deployerBalBefore = await ethers.provider.getBalance(deployer.address);

      await qnns.connect(user1).transferName(nameHash, user2.address, { value: minFee });

      expect(await qnns.ownerOf(BigInt(nameHash))).to.equal(user2.address);

      const deployerBalAfter = await ethers.provider.getBalance(deployer.address);
      expect(deployerBalAfter - deployerBalBefore).to.equal(minFee);
    });

    it("should reject transferName with insufficient fee", async function () {
      await expect(
        qnns.connect(user1).transferName(nameHash, user2.address, { value: 1n })
      ).to.be.revertedWithCustomError(qnns, "TransferFeeRequired");
    });
  });

  // ============ Profile Management ============

  describe("Profile Management", function () {
    let nameHash: string;

    beforeEach(async function () {
      const payment = getRequiredPayment("alice");
      const result = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);
      nameHash = result.nameHash;
    });

    it("should set quai address", async function () {
      await qnns.connect(user1).setQuaiAddress(nameHash, user2.address);
      expect(await qnns.getQuaiAddress(nameHash)).to.equal(user2.address);
    });

    it("should set qi payment code", async function () {
      const paymentCode = "PM8T" + "a".repeat(96);
      await qnns.connect(user1).setQiPaymentCode(nameHash, paymentCode);
      expect(await qnns.getQiPaymentCode(nameHash)).to.equal(paymentCode);
    });

    it("should set avatar", async function () {
      const avatar = ethers.randomBytes(100);
      await qnns.connect(user1).setAvatar(nameHash, avatar);
      const stored = await qnns.getAvatar(nameHash);
      expect(stored).to.equal(ethers.hexlify(avatar));
    });

    it("should reject avatar over 15KB", async function () {
      const largeAvatar = ethers.randomBytes(15361);
      await expect(
        qnns.connect(user1).setAvatar(nameHash, largeAvatar)
      ).to.be.revertedWithCustomError(qnns, "AvatarTooLarge");
    });

    it("should set profile fields (stored in NameProfile)", async function () {
      await qnns.connect(user1).setProfile(nameHash, "Alice", "Hello world", "https://alice.dev");
      const np = await qnns.getNameProfile(nameHash);
      expect(np.displayName).to.equal("Alice");
      expect(np.description).to.equal("Hello world");
      expect(np.url).to.equal("https://alice.dev");
    });

    it("should set social links (stored in NameProfile)", async function () {
      await qnns.connect(user1).setSocials(nameHash, "@alice", "alice", "alice#1234", "@alice_tg");
      const np = await qnns.getNameProfile(nameHash);
      expect(np.twitter).to.equal("@alice");
      expect(np.github).to.equal("alice");
      expect(np.discord).to.equal("alice#1234");
      expect(np.telegram).to.equal("@alice_tg");
    });

    it("should set nostr pubkey", async function () {
      const pubkey = "a".repeat(64);
      await qnns.connect(user1).setNostrPubkey(nameHash, pubkey);
      expect(await qnns.getNostrPubkey(nameHash)).to.equal(pubkey);
    });

    it("should reject invalid nostr pubkey", async function () {
      await expect(
        qnns.connect(user1).setNostrPubkey(nameHash, "tooshort")
      ).to.be.revertedWithCustomError(qnns, "InvalidName");
    });

    it("should set content hash for IPFS lookup", async function () {
      const contentHash = ethers.getBytes("0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e2a898ec68d135");
      await qnns.connect(user1).setContentHash(nameHash, contentHash);
      const stored = await qnns.getContentHash(nameHash);
      expect(stored).to.equal(ethers.hexlify(contentHash));
    });

    it("should clear content hash", async function () {
      const contentHash = ethers.getBytes("0xe3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e2a898ec68d135");
      await qnns.connect(user1).setContentHash(nameHash, contentHash);
      await qnns.connect(user1).setContentHash(nameHash, "0x");
      const stored = await qnns.getContentHash(nameHash);
      expect(stored).to.equal("0x");
    });

    it("should reject profile update by non-owner", async function () {
      await expect(
        qnns.connect(user2).setQuaiAddress(nameHash, user2.address)
      ).to.be.revertedWithCustomError(qnns, "NotOwner");
    });
  });

  // ============ Admin Functions ============

  describe("Admin Functions", function () {
    it("should revoke a name and return lock", async function () {
      const payment = getRequiredPayment("alice");
      const { nameHash } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      const lockAmount = (await qnns.getNameData(nameHash)).lockAmount;
      const balBefore = await ethers.provider.getBalance(user1.address);
      await qnns.adminRevoke(nameHash, "policy violation");
      const balAfter = await ethers.provider.getBalance(user1.address);

      expect(await qnns.isRegistered(nameHash)).to.be.false;
      expect(balAfter - balBefore).to.equal(lockAmount);
    });

    it("should assign a name directly", async function () {
      const nameHash = hashName("admin-name");
      await qnns.adminAssign(nameHash, "admin-name", user1.address, user1.address, "");

      expect(await qnns.isRegistered(nameHash)).to.be.true;
      expect(await qnns.ownerOf(BigInt(nameHash))).to.equal(user1.address);
    });

    it("should assign with lock deposit", async function () {
      const nameHash = hashName("admin-locked");
      const lockAmount = ethers.parseEther("500");
      await qnns.adminAssign(nameHash, "admin-locked", user1.address, user1.address, "", { value: lockAmount });

      const nd = await qnns.getNameData(nameHash);
      expect(nd.lockAmount).to.equal(lockAmount);
    });

    it("should reserve and unreserve names", async function () {
      const nameHash = hashName("reserved-test");
      await qnns.adminReserve([nameHash]);
      expect(await qnns.reserved(nameHash)).to.be.true;

      await qnns.adminUnreserve([nameHash]);
      expect(await qnns.reserved(nameHash)).to.be.false;
    });

    it("should block names and release if registered", async function () {
      const payment = getRequiredPayment("alice");
      const { nameHash } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      await qnns.adminBlock([nameHash]);

      expect(await qnns.blocked(nameHash)).to.be.true;
      expect(await qnns.isRegistered(nameHash)).to.be.false;
    });

    it("should update min auction price", async function () {
      const newMin = ethers.parseEther("2000");
      await qnns.adminSetMinAuctionPrice(newMin);
      expect(await qnns.minAuctionPrice()).to.equal(newMin);
    });

    it("should update min lock amount", async function () {
      const newMin = ethers.parseEther("1000");
      await qnns.adminSetMinLockAmount(newMin);
      expect(await qnns.minLockAmount()).to.equal(newMin);
    });

    it("should update exchange rate", async function () {
      const newRate = ethers.parseEther("14");
      await qnns.adminSetQuaiPerQi(newRate);
      expect(await qnns.quaiPerQi()).to.equal(newRate);
    });

    it("should update yearly pricing tiers", async function () {
      const newPrice = ethers.parseEther("20");
      await qnns.adminSetYearlyPriceQi5Plus(newPrice);
      expect(await qnns.yearlyPriceQi5Plus()).to.equal(newPrice);

      await qnns.adminSetYearlyPriceQi4Char(ethers.parseEther("400"));
      expect(await qnns.yearlyPriceQi4Char()).to.equal(ethers.parseEther("400"));

      await qnns.adminSetYearlyPriceQi3OrLess(ethers.parseEther("2000"));
      expect(await qnns.yearlyPriceQi3OrLess()).to.equal(ethers.parseEther("2000"));
    });

    it("should update auction duration", async function () {
      const newDuration = 48 * 3600; // 48 hours
      await qnns.adminSetAuctionDuration(newDuration);
      expect(await qnns.auctionDuration()).to.equal(newDuration);
    });

    it("should update anti-snipe window", async function () {
      const newWindow = 2 * 3600; // 2 hours
      await qnns.adminSetAntiSnipeWindow(newWindow);
      expect(await qnns.antiSnipeWindow()).to.equal(newWindow);
    });

    it("should update burn address", async function () {
      await qnns.adminSetBurnAddress(user3.address);
      expect(await qnns.burnAddress()).to.equal(user3.address);
    });

    it("should transfer admin role", async function () {
      await qnns.adminSetAdmin(user1.address);
      expect(await qnns.admin()).to.equal(user1.address);

      await expect(
        qnns.adminSetAdmin(deployer.address)
      ).to.be.revertedWithCustomError(qnns, "NotAdmin");
    });

    it("should reject admin actions from non-admin", async function () {
      await expect(
        qnns.connect(user1).adminSetAdmin(user1.address)
      ).to.be.revertedWithCustomError(qnns, "NotAdmin");
    });
  });

  // ============ Tiered Pricing Tests ============

  describe("Tiered Pricing", function () {
    it("should charge higher yearly fee for 3-char names", async function () {
      // "abc" is 3 chars → uses yearlyPriceQi3OrLess = 1000 QUAI
      const payment = MIN_LOCK_AMOUNT + YEARLY_3ORLESS; // 500 + 1000 = 1500 QUAI
      const { nameHash } = await startAndFinalizeAuction("abc", MIN_AUCTION_PRICE, payment, user1);

      const nd = await qnns.getNameData(nameHash);
      expect(nd.lockAmount).to.equal(MIN_LOCK_AMOUNT);
    });

    it("should charge medium yearly fee for 4-char names", async function () {
      const payment = MIN_LOCK_AMOUNT + YEARLY_4CHAR; // 500 + 200 = 700 QUAI
      const { nameHash } = await startAndFinalizeAuction("abcd", MIN_AUCTION_PRICE, payment, user1);

      const nd = await qnns.getNameData(nameHash);
      expect(nd.lockAmount).to.equal(MIN_LOCK_AMOUNT);
    });

    it("should charge low yearly fee for 5+ char names", async function () {
      const payment = MIN_LOCK_AMOUNT + YEARLY_5PLUS; // 500 + 10 = 510 QUAI
      const { nameHash } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      const nd = await qnns.getNameData(nameHash);
      expect(nd.lockAmount).to.equal(MIN_LOCK_AMOUNT);
    });

    it("should reject finalization with insufficient payment for short names", async function () {
      // Try to register "ab" with only enough for 5+ tier
      const tx = await qnns.connect(user1).startAuction("ab", { value: MIN_AUCTION_PRICE });
      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return qnns.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "AuctionStarted";
        } catch { return false; }
      });
      const parsed = qnns.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
      const auctionId = parsed!.args[0];

      await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1]);
      await ethers.provider.send("evm_mine", []);

      // Pay only enough for 5+ tier (510 QUAI), but "ab" needs 1500 QUAI
      const insufficientPayment = MIN_LOCK_AMOUNT + YEARLY_5PLUS;
      await expect(
        qnns.connect(user1).finalizeAuction(auctionId, user1.address, "", { value: insufficientPayment })
      ).to.be.revertedWithCustomError(qnns, "InsufficientPayment");
    });
  });

  // ============ View Functions ============

  describe("View Functions", function () {
    it("should hash name correctly", async function () {
      const hash = await qnns.hashName("alice");
      expect(hash).to.equal(hashName("alice"));
    });

    it("should report availability correctly", async function () {
      expect(await qnns.isAvailable("alice")).to.be.true;

      await qnns.connect(user1).startAuction("alice", { value: MIN_AUCTION_PRICE });

      expect(await qnns.isAvailable("alice")).to.be.false;
    });

    it("should report blocked names as unavailable", async function () {
      const nameHash = hashName("blocked");
      await qnns.adminBlock([nameHash]);
      expect(await qnns.isAvailable("blocked")).to.be.false;
    });

    it("should report reserved names as unavailable", async function () {
      const nameHash = hashName("reserved");
      await qnns.adminReserve([nameHash]);
      expect(await qnns.isAvailable("reserved")).to.be.false;
    });

    it("should report name as available after full expiry", async function () {
      const payment = getRequiredPayment("alice");
      await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      expect(await qnns.isAvailable("alice")).to.be.false;

      // Fast forward past expiry + grace
      await ethers.provider.send("evm_increaseTime", [ONE_YEAR + GRACE_PERIOD + 1]);
      await ethers.provider.send("evm_mine", []);

      expect(await qnns.isAvailable("alice")).to.be.true;
    });
  });

  // ============ Edge Cases ============

  describe("Edge Cases", function () {
    it("should handle auction with single bidder", async function () {
      const payment = getRequiredPayment("solo1");
      const { nameHash } = await startAndFinalizeAuction("solo1", MIN_AUCTION_PRICE, payment, user1);

      expect(await qnns.isRegistered(nameHash)).to.be.true;
      expect(await qnns.ownerOf(BigInt(nameHash))).to.equal(user1.address);
    });

    it("should allow hyphens and underscores in names", async function () {
      const payment = getRequiredPayment("my-name");
      await startAndFinalizeAuction("my-name", MIN_AUCTION_PRICE, payment, user1);
      await startAndFinalizeAuction("my_name", MIN_AUCTION_PRICE, payment, user2);

      expect(await qnns.isRegistered(hashName("my-name"))).to.be.true;
      expect(await qnns.isRegistered(hashName("my_name"))).to.be.true;
    });

    it("should handle marketplace bid after name transfer", async function () {
      const payment = getRequiredPayment("alice");
      const { nameHash } = await startAndFinalizeAuction("alice", MIN_AUCTION_PRICE, payment, user1);

      await qnns.connect(user2).placeBid(nameHash, { value: ethers.parseEther("5000") });

      const fee = YEARLY_5PLUS / 100n;
      await qnns.connect(user1).transferName(nameHash, user3.address, { value: fee });

      await qnns.connect(user3).acceptBid(nameHash, 0);
      expect(await qnns.ownerOf(BigInt(nameHash))).to.equal(user2.address);
    });

    it("should handle name with all valid character types", async function () {
      const payment = getRequiredPayment("abc-123_xyz");
      await startAndFinalizeAuction("abc-123_xyz", MIN_AUCTION_PRICE, payment, user1);
      expect(await qnns.isRegistered(hashName("abc-123_xyz"))).to.be.true;
    });
  });

  // ============ ERC-721 Compliance ============

  describe("ERC-721 Compliance", function () {
    it("should return correct name and symbol", async function () {
      expect(await qnns.name()).to.equal("Quai Network Name Service");
      expect(await qnns.symbol()).to.equal("QNNS");
    });

    it("should track balance correctly", async function () {
      const payment = getRequiredPayment("name1");
      expect(await qnns.balanceOf(user1.address)).to.equal(0n);

      await startAndFinalizeAuction("name1", MIN_AUCTION_PRICE, payment, user1);
      expect(await qnns.balanceOf(user1.address)).to.equal(1n);

      await startAndFinalizeAuction("name2", MIN_AUCTION_PRICE, payment, user1);
      expect(await qnns.balanceOf(user1.address)).to.equal(2n);
    });

    it("should support ERC-721 interface", async function () {
      expect(await qnns.supportsInterface("0x80ac58cd")).to.be.true;
    });
  });
});
