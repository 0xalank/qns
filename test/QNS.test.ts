import { expect } from 'chai';
import { ethers } from 'hardhat';
import { QNS } from '../typechain-types';

describe('QNS', function () {
  let qns: QNS;
  let owner: any;
  let user1: any;
  let user2: any;

  // Sample BIP47 payment code (starts with 0x47)
  const samplePaymentCode = ethers.zeroPadBytes('0x47', 80);
  const samplePaymentCode2 = ethers.zeroPadBytes(
    '0x4700000000000000000000000000000000000000000000000000000000000001',
    80
  );

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const QNS = await ethers.getContractFactory('QNS');
    qns = await QNS.deploy(owner.address);
    await qns.waitForDeployment();
  });

  describe('Registration', function () {
    it('should register a new name', async function () {
      await qns.connect(user1).register(
        'alice',
        samplePaymentCode,
        samplePaymentCode
      );

      const nameHash = await qns.hashName('alice');
      const profile = await qns.getProfile(nameHash);

      expect(profile.owner).to.equal(user1.address);
    });

    it('should reject invalid names', async function () {
      // Name with uppercase
      await expect(
        qns.connect(user1).register('Alice', samplePaymentCode, samplePaymentCode)
      ).to.be.revertedWithCustomError(qns, 'InvalidName');

      // Name with spaces
      await expect(
        qns.connect(user1).register('al ice', samplePaymentCode, samplePaymentCode)
      ).to.be.revertedWithCustomError(qns, 'InvalidName');

      // Empty name
      await expect(
        qns.connect(user1).register('', samplePaymentCode, samplePaymentCode)
      ).to.be.revertedWithCustomError(qns, 'InvalidName');
    });

    it('should reject invalid payment codes', async function () {
      // Payment code not starting with 0x47
      const invalidPC = ethers.zeroPadBytes('0x00', 80);

      await expect(
        qns.connect(user1).register('alice', invalidPC, samplePaymentCode)
      ).to.be.revertedWithCustomError(qns, 'InvalidPaymentCode');
    });

    it('should not allow duplicate registration', async function () {
      await qns.connect(user1).register(
        'alice',
        samplePaymentCode,
        samplePaymentCode
      );

      await expect(
        qns.connect(user2).register('alice', samplePaymentCode, samplePaymentCode)
      ).to.be.revertedWithCustomError(qns, 'NameAlreadyRegistered');
    });

    it('should allow names with numbers and hyphens', async function () {
      await qns.connect(user1).register(
        'alice-123',
        samplePaymentCode,
        samplePaymentCode
      );

      const isAvailable = await qns.isAvailable('alice-123');
      expect(isAvailable).to.be.false;
    });
  });

  describe('Payment Codes', function () {
    beforeEach(async function () {
      await qns.connect(user1).register(
        'alice',
        samplePaymentCode,
        samplePaymentCode
      );
    });

    it('should update Quai payment code', async function () {
      const nameHash = await qns.hashName('alice');

      await qns.connect(user1).setQuaiPaymentCode(nameHash, samplePaymentCode2);

      const pc = await qns.getPaymentCode(nameHash, true);
      expect(pc).to.equal(samplePaymentCode2);
    });

    it('should update Qi payment code', async function () {
      const nameHash = await qns.hashName('alice');

      await qns.connect(user1).setQiPaymentCode(nameHash, samplePaymentCode2);

      const pc = await qns.getPaymentCode(nameHash, false);
      expect(pc).to.equal(samplePaymentCode2);
    });

    it('should reject non-owner payment code update', async function () {
      const nameHash = await qns.hashName('alice');

      await expect(
        qns.connect(user2).setQuaiPaymentCode(nameHash, samplePaymentCode2)
      ).to.be.revertedWithCustomError(qns, 'NotOwner');
    });
  });

  describe('Avatar', function () {
    beforeEach(async function () {
      await qns.connect(user1).register(
        'alice',
        samplePaymentCode,
        samplePaymentCode
      );
    });

    it('should set avatar', async function () {
      const nameHash = await qns.hashName('alice');
      const avatarData = ethers.toUtf8Bytes('fake-image-data');

      await qns.connect(user1).setAvatar(nameHash, avatarData);

      const avatar = await qns.getAvatar(nameHash);
      expect(avatar).to.equal(ethers.hexlify(avatarData));
    });

    it('should reject avatar too large', async function () {
      const nameHash = await qns.hashName('alice');
      const largeAvatar = ethers.randomBytes(20000); // > 15KB

      await expect(
        qns.connect(user1).setAvatar(nameHash, largeAvatar)
      ).to.be.revertedWithCustomError(qns, 'AvatarTooLarge');
    });
  });

  describe('Transfer', function () {
    beforeEach(async function () {
      await qns.connect(user1).register(
        'alice',
        samplePaymentCode,
        samplePaymentCode
      );
    });

    it('should transfer name ownership', async function () {
      const nameHash = await qns.hashName('alice');

      await qns.connect(user1).transfer(nameHash, user2.address);

      const profile = await qns.getProfile(nameHash);
      expect(profile.owner).to.equal(user2.address);
    });

    it('should update owned names array', async function () {
      const nameHash = await qns.hashName('alice');

      // Before transfer
      let user1Names = await qns.getNamesOf(user1.address);
      expect(user1Names).to.include(nameHash);

      // Transfer
      await qns.connect(user1).transfer(nameHash, user2.address);

      // After transfer
      user1Names = await qns.getNamesOf(user1.address);
      const user2Names = await qns.getNamesOf(user2.address);

      expect(user1Names).to.not.include(nameHash);
      expect(user2Names).to.include(nameHash);
    });
  });

  describe('Availability', function () {
    it('should report unregistered names as available', async function () {
      const isAvailable = await qns.isAvailable('newname');
      expect(isAvailable).to.be.true;
    });

    it('should report registered names as unavailable', async function () {
      await qns.connect(user1).register(
        'alice',
        samplePaymentCode,
        samplePaymentCode
      );

      const isAvailable = await qns.isAvailable('alice');
      expect(isAvailable).to.be.false;
    });
  });
});
