import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { constants } from "ethers";
import { ethers } from "hardhat";
import { getBytesAndCreateToken } from '../src'
import { mine } from "@nomicfoundation/hardhat-network-helpers";

const SERVICE = "service.invalid";
const STATEMENT = "I accept the ServiceOrg Terms of Service: https://service.invalid/tos";
const URI = "https://service.invalid/login";
const VERSION = "1";

describe("TrustedForwarder", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployForwarder() {
    const [deployer, alice] = await ethers.getSigners()

    const DiceRoller = await ethers.getContractFactory('TestDiceRoller')
    const diceRoller = await DiceRoller.deploy()

    const Noncer = await ethers.getContractFactory('Noncer')
    const noncer = await Noncer.deploy(diceRoller.address)

    const factory = await ethers.getContractFactory("TrustedForwarder");
    const trustedForwarder = await factory.deploy(
      noncer.address,
      SERVICE,
      STATEMENT,
      URI,
      VERSION,
    )

    const ForwarderTester = await ethers.getContractFactory("ForwarderTester")
    const forwarderTester = await ForwarderTester.deploy(trustedForwarder.address)
    return { trustedForwarder, deployer, alice, forwarderTester }
  }

  describe("verify", function () {
    it("should verify a proper signature", async function () {
      const { trustedForwarder, deployer, alice } = await loadFixture(deployForwarder);
      const { signature, issuedAt } = await getBytesAndCreateToken(trustedForwarder, alice, deployer)
      const [result] = await trustedForwarder.verify(alice.address, deployer.address, issuedAt, 0, signature)
      expect(result).to.be.true
    });
  });

  describe('relaying transactions', () => {
    it('should relay a transaction', async () => {
      const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
      const { signature, issuedAt } = await getBytesAndCreateToken(trustedForwarder, alice, deployer)

      const relayTx = await forwarderTester.populateTransaction.testSender()
      if (!relayTx.data || !relayTx.to) {
        throw new Error('no data')
      }

      const gas = await alice.estimateGas({ ...relayTx, from: alice.address })

      await expect(trustedForwarder.execute({
        to: relayTx.to,
        from: alice.address,
        sessionExpiry: 0,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
        issuedAt,
      }, signature)).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
    })

    it('should relay multiple transactions', async () => {
      const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
      const { signature, issuedAt } = await getBytesAndCreateToken(trustedForwarder, alice, deployer)

      const relayTxOne = await forwarderTester.populateTransaction.testSender()
      const relayTxTwo = await forwarderTester.populateTransaction.testSender()

      const gas = await alice.estimateGas({ ...relayTxOne, from: alice.address })

      await expect(trustedForwarder.multiExecute(
        [
          {
            to: forwarderTester.address,
            from: alice.address,
            data: relayTxOne.data!,
            value: 0,
            sessionExpiry: 0,
            gas: gas.mul(120).div(100).toNumber(),
            issuedAt,
          },
          {
            to: forwarderTester.address,
            from: alice.address,
            data: relayTxTwo.data!,
            value: 0,
            sessionExpiry: 0,
            gas: gas.mul(120).div(100).toNumber(),
            issuedAt,
          },
        ], signature)).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
    })

  })

  describe('revoke', () => {
    const contractsAndToken = async () => {
      const contracts = await loadFixture(deployForwarder);
      const { trustedForwarder, deployer, alice } = contracts
      const tokenResp = await getBytesAndCreateToken(trustedForwarder, alice, deployer)
      return {
        ...contracts,
        ...tokenResp,
      }
    }

    it("should remove access for a particular token", async () => {
      const { trustedForwarder, alice, deployer, forwarderTester, signature, issuedAt } = await loadFixture(contractsAndToken);

      const sharedTokenParams = {
        from: alice.address,
        sessionExpiry: 0,
        issuedAt,
      }

      await trustedForwarder.connect(deployer).revoke(
        {
          ...sharedTokenParams,
          to: constants.AddressZero,
          data: await trustedForwarder.hashForToken(alice.address, deployer.address, issuedAt, 0),
          gas: 0,
          value: 0,
        }, signature)

      const relayTx = await forwarderTester.populateTransaction.testSender()
      if (!relayTx.data || !relayTx.to) {
        throw new Error('no data')
      }

      const gas = await alice.estimateGas({ ...relayTx, from: alice.address })

      await expect(trustedForwarder.execute({
        ...sharedTokenParams,
        to: relayTx.to,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
      }, signature)).to.be.revertedWith("TrustedForwarder: signature does not match request")
    })
  })

  describe('session expiration', () => {

    it("should verify a proper signature", async function () {
      const { trustedForwarder, deployer, alice } = await loadFixture(deployForwarder);
      const expiry = 10 // expire in 10 blocks of non use
      const { signature, issuedAt } = await getBytesAndCreateToken(trustedForwarder, alice, deployer, expiry)
      const [result] = await trustedForwarder.verify(alice.address, deployer.address, issuedAt, expiry, signature)
      expect(result).to.be.true
    });

    it('should deny a signature that was created, but then not used in time', async () => {
      const { trustedForwarder, deployer, alice } = await loadFixture(deployForwarder);
      const expiry = 10 // expire in 10 blocks of non use
      const { signature, issuedAt } = await getBytesAndCreateToken(trustedForwarder, alice, deployer, expiry)

      await mine(11)

      const [result] = await trustedForwarder.verify(alice.address, deployer.address, issuedAt, expiry, signature)
      expect(result).to.be.false
    })

    it('should allow a signature to be continually used but expire if not used', async () => {
      const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
      const expiry = 10 // expire in 10 blocks of non use
      const { signature, issuedAt } = await getBytesAndCreateToken(trustedForwarder, alice, deployer, expiry)

      await mine(7)

      const [result] = await trustedForwarder.verify(alice.address, deployer.address, issuedAt, expiry, signature)
      expect(result).to.be.true

      const relayTx = await forwarderTester.populateTransaction.testSender()
      if (!relayTx.data || !relayTx.to) {
        throw new Error('no data')
      }

      const gas = await alice.estimateGas({ ...relayTx, from: alice.address })

      await expect(trustedForwarder.connect(deployer).execute({
        to: relayTx.to,
        from: alice.address,
        sessionExpiry: expiry,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
        issuedAt,
      }, signature)).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)

      await mine(9)

      await expect(trustedForwarder.execute({
        to: relayTx.to,
        from: alice.address,
        sessionExpiry: expiry,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
        issuedAt,
      }, signature)).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)

      await mine(10)

      await expect(trustedForwarder.execute({
        to: relayTx.to,
        from: alice.address,
        sessionExpiry: expiry,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
        issuedAt,
      }, signature)).to.be.revertedWith('TrustedForwarder: signature does not match request')

    })

  })

});
