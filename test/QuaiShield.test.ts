import { expect } from 'chai';
import { ethers } from 'hardhat';
import { QuaiShield, PoseidonHasher, MockVerifier } from '../typechain-types';

describe('QuaiShield', function () {
  let shield: QuaiShield;
  let hasher: PoseidonHasher;
  let verifier: MockVerifier;
  let owner: any;
  let user1: any;
  let user2: any;
  let relayer: any;

  const DENOMINATION_01 = ethers.parseEther('0.1');
  const DENOMINATION_1 = ethers.parseEther('1');
  const DENOMINATION_10 = ethers.parseEther('10');

  // Generate a random commitment
  function randomCommitment(): string {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  beforeEach(async function () {
    [owner, user1, user2, relayer] = await ethers.getSigners();

    // Deploy Poseidon Hasher
    const PoseidonHasher = await ethers.getContractFactory('PoseidonHasher');
    hasher = await PoseidonHasher.deploy();
    await hasher.waitForDeployment();

    // Deploy Mock Verifiers (one for each denomination)
    const MockVerifier = await ethers.getContractFactory('MockVerifier');
    verifier = await MockVerifier.deploy();
    await verifier.waitForDeployment();

    // Deploy QuaiShield
    const QuaiShield = await ethers.getContractFactory('QuaiShield');
    shield = await QuaiShield.deploy(
      20, // levels
      await hasher.getAddress(),
      await verifier.getAddress(), // 0.1
      await verifier.getAddress(), // 1
      await verifier.getAddress(), // 10
      await verifier.getAddress()  // 100
    );
    await shield.waitForDeployment();
  });

  describe('Deposits', function () {
    it('should accept valid denomination deposit', async function () {
      const commitment = randomCommitment();

      await expect(
        shield.connect(user1).deposit(commitment, DENOMINATION_1, { value: DENOMINATION_1 })
      ).to.emit(shield, 'Deposit');

      const count = await shield.getAnonymitySetSize(DENOMINATION_1);
      expect(count).to.equal(1);
    });

    it('should reject invalid denomination', async function () {
      const commitment = randomCommitment();
      const invalidAmount = ethers.parseEther('0.5');

      await expect(
        shield.connect(user1).deposit(commitment, invalidAmount, { value: invalidAmount })
      ).to.be.revertedWithCustomError(shield, 'InvalidDenomination');
    });

    it('should reject duplicate commitment', async function () {
      const commitment = randomCommitment();

      await shield.connect(user1).deposit(commitment, DENOMINATION_1, { value: DENOMINATION_1 });

      await expect(
        shield.connect(user2).deposit(commitment, DENOMINATION_1, { value: DENOMINATION_1 })
      ).to.be.revertedWithCustomError(shield, 'CommitmentAlreadyExists');
    });

    it('should increment leaf index', async function () {
      const commitment1 = randomCommitment();
      const commitment2 = randomCommitment();

      const tx1 = await shield.connect(user1).deposit(commitment1, DENOMINATION_1, { value: DENOMINATION_1 });
      const receipt1 = await tx1.wait();
      const event1 = receipt1?.logs.find((log: any) => {
        try {
          const parsed = shield.interface.parseLog(log);
          return parsed?.name === 'Deposit';
        } catch {
          return false;
        }
      });
      const parsed1 = shield.interface.parseLog(event1!);

      const tx2 = await shield.connect(user2).deposit(commitment2, DENOMINATION_1, { value: DENOMINATION_1 });
      const receipt2 = await tx2.wait();
      const event2 = receipt2?.logs.find((log: any) => {
        try {
          const parsed = shield.interface.parseLog(log);
          return parsed?.name === 'Deposit';
        } catch {
          return false;
        }
      });
      const parsed2 = shield.interface.parseLog(event2!);

      expect(parsed1?.args?.leafIndex).to.equal(0);
      expect(parsed2?.args?.leafIndex).to.equal(1);
    });

    it('should track anonymity set per denomination', async function () {
      // Deposit 3x 1 QUAI
      await shield.connect(user1).deposit(randomCommitment(), DENOMINATION_1, { value: DENOMINATION_1 });
      await shield.connect(user1).deposit(randomCommitment(), DENOMINATION_1, { value: DENOMINATION_1 });
      await shield.connect(user1).deposit(randomCommitment(), DENOMINATION_1, { value: DENOMINATION_1 });

      // Deposit 1x 0.1 QUAI
      await shield.connect(user1).deposit(randomCommitment(), DENOMINATION_01, { value: DENOMINATION_01 });

      expect(await shield.getAnonymitySetSize(DENOMINATION_1)).to.equal(3);
      expect(await shield.getAnonymitySetSize(DENOMINATION_01)).to.equal(1);
      expect(await shield.getAnonymitySetSize(DENOMINATION_10)).to.equal(0);
    });
  });

  describe('Withdrawals', function () {
    let commitment: string;
    let nullifierHash: string;

    beforeEach(async function () {
      commitment = randomCommitment();
      nullifierHash = randomCommitment();

      await shield.connect(user1).deposit(commitment, DENOMINATION_1, { value: DENOMINATION_1 });
    });

    it('should allow withdrawal with valid proof', async function () {
      const root = await shield.getLastRoot();
      const proof = '0x'; // Mock verifier accepts any proof

      const balanceBefore = await ethers.provider.getBalance(user2.address);

      await shield.connect(user1).withdraw(
        proof,
        root,
        nullifierHash,
        user2.address,
        ethers.ZeroAddress,
        DENOMINATION_1
      );

      const balanceAfter = await ethers.provider.getBalance(user2.address);
      expect(balanceAfter - balanceBefore).to.equal(DENOMINATION_1);
    });

    it('should mark nullifier as spent', async function () {
      const root = await shield.getLastRoot();
      const proof = '0x';

      expect(await shield.isSpent(nullifierHash)).to.be.false;

      await shield.connect(user1).withdraw(
        proof,
        root,
        nullifierHash,
        user2.address,
        ethers.ZeroAddress,
        DENOMINATION_1
      );

      expect(await shield.isSpent(nullifierHash)).to.be.true;
    });

    it('should reject double-spend', async function () {
      const root = await shield.getLastRoot();
      const proof = '0x';

      await shield.connect(user1).withdraw(
        proof,
        root,
        nullifierHash,
        user2.address,
        ethers.ZeroAddress,
        DENOMINATION_1
      );

      await expect(
        shield.connect(user1).withdraw(
          proof,
          root,
          nullifierHash,
          user2.address,
          ethers.ZeroAddress,
          DENOMINATION_1
        )
      ).to.be.revertedWithCustomError(shield, 'NullifierAlreadyUsed');
    });

    it('should pay relayer fee', async function () {
      const root = await shield.getLastRoot();
      const proof = '0x';

      const relayerBalanceBefore = await ethers.provider.getBalance(relayer.address);
      const recipientBalanceBefore = await ethers.provider.getBalance(user2.address);

      await shield.connect(user1).withdraw(
        proof,
        root,
        nullifierHash,
        user2.address,
        relayer.address,
        DENOMINATION_1
      );

      const relayerBalanceAfter = await ethers.provider.getBalance(relayer.address);
      const recipientBalanceAfter = await ethers.provider.getBalance(user2.address);

      // Default fee is 0.5% (50 bps)
      const expectedFee = DENOMINATION_1 * 50n / 10000n;
      const expectedRecipientAmount = DENOMINATION_1 - expectedFee;

      expect(relayerBalanceAfter - relayerBalanceBefore).to.equal(expectedFee);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(expectedRecipientAmount);
    });

    it('should reject invalid proof', async function () {
      // Configure mock verifier to reject
      await verifier.setVerificationResult(false);

      const root = await shield.getLastRoot();
      const proof = '0x';

      await expect(
        shield.connect(user1).withdraw(
          proof,
          root,
          nullifierHash,
          user2.address,
          ethers.ZeroAddress,
          DENOMINATION_1
        )
      ).to.be.revertedWithCustomError(shield, 'InvalidProof');

      // Reset for other tests
      await verifier.setVerificationResult(true);
    });
  });

  describe('Multi-Withdrawal (Sweep)', function () {
    it('should sweep multiple deposits', async function () {
      // Make 3 deposits
      const commitments = [randomCommitment(), randomCommitment(), randomCommitment()];
      const nullifierHashes = [randomCommitment(), randomCommitment(), randomCommitment()];

      for (const c of commitments) {
        await shield.connect(user1).deposit(c, DENOMINATION_1, { value: DENOMINATION_1 });
      }

      const root = await shield.getLastRoot();
      const proofs = ['0x', '0x', '0x'];
      const roots = [root, root, root];
      const denominations = [DENOMINATION_1, DENOMINATION_1, DENOMINATION_1];

      const balanceBefore = await ethers.provider.getBalance(user2.address);

      await shield.connect(user1).multiWithdraw(
        proofs,
        roots,
        nullifierHashes,
        denominations,
        user2.address,
        ethers.ZeroAddress
      );

      const balanceAfter = await ethers.provider.getBalance(user2.address);
      expect(balanceAfter - balanceBefore).to.equal(DENOMINATION_1 * 3n);
    });

    it('should mark all nullifiers as spent', async function () {
      const commitments = [randomCommitment(), randomCommitment()];
      const nullifierHashes = [randomCommitment(), randomCommitment()];

      for (const c of commitments) {
        await shield.connect(user1).deposit(c, DENOMINATION_1, { value: DENOMINATION_1 });
      }

      const root = await shield.getLastRoot();

      await shield.connect(user1).multiWithdraw(
        ['0x', '0x'],
        [root, root],
        nullifierHashes,
        [DENOMINATION_1, DENOMINATION_1],
        user2.address,
        ethers.ZeroAddress
      );

      expect(await shield.isSpent(nullifierHashes[0])).to.be.true;
      expect(await shield.isSpent(nullifierHashes[1])).to.be.true;
    });
  });

  describe('Merkle Tree', function () {
    it('should update root after deposit', async function () {
      const rootBefore = await shield.getLastRoot();

      await shield.connect(user1).deposit(randomCommitment(), DENOMINATION_1, { value: DENOMINATION_1 });

      const rootAfter = await shield.getLastRoot();
      expect(rootAfter).to.not.equal(rootBefore);
    });

    it('should recognize recent roots', async function () {
      await shield.connect(user1).deposit(randomCommitment(), DENOMINATION_1, { value: DENOMINATION_1 });
      const root1 = await shield.getLastRoot();

      await shield.connect(user1).deposit(randomCommitment(), DENOMINATION_1, { value: DENOMINATION_1 });
      const root2 = await shield.getLastRoot();

      // Both roots should be valid
      expect(await shield.isKnownRoot(root1)).to.be.true;
      expect(await shield.isKnownRoot(root2)).to.be.true;
    });
  });

  describe('Admin', function () {
    it('should allow admin to update relayer fee', async function () {
      await shield.connect(owner).setRelayerFee(100); // 1%

      expect(await shield.relayerFeeBps()).to.equal(100);
    });

    it('should reject non-admin fee update', async function () {
      await expect(
        shield.connect(user1).setRelayerFee(100)
      ).to.be.reverted;
    });

    it('should reject excessive fee', async function () {
      await expect(
        shield.connect(owner).setRelayerFee(600) // 6% > 5% max
      ).to.be.revertedWithCustomError(shield, 'InvalidRelayerFee');
    });
  });
});
