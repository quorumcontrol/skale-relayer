import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createToken } from '../src'

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

    const factory = await ethers.getContractFactory("TrustedForwarder");
    const trustedForwarder = await factory.deploy(
      diceRoller.address,
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
      const { signature, issuedAt } = await createToken(trustedForwarder, alice, deployer)
      expect(await trustedForwarder.verify(alice.address, deployer.address, issuedAt, signature)).to.be.true
    });
  });

  describe('relaying transactions', () => {
    it('should relay a transaction', async () => {
      const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
      const { signature, issuedAt } = await createToken(trustedForwarder, alice, deployer)

      const relayTx = await forwarderTester.populateTransaction.testSender()
      if (!relayTx.data || !relayTx.to) {
        throw new Error('no data')
      }

      const gas = await alice.estimateGas({ ...relayTx, from: alice.address })

      await expect(trustedForwarder.execute({
        to: relayTx.to,
        from: alice.address,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
        issuedAt,
      }, signature)).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
    })

    it('should relay multiple transactions', async () => {
      const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
      const { signature, issuedAt } = await createToken(trustedForwarder, alice, deployer)

      const relayTxOne = await forwarderTester.populateTransaction.testSender()
      const relayTxTwo = await forwarderTester.populateTransaction.testSender()

      const gas = await alice.estimateGas({ ...relayTxOne, from: alice.address })

      await expect(trustedForwarder.multiExecute([
        {
          to: forwarderTester.address,
          from: alice.address,
          data: relayTxOne.data!,
          value: 0,
          gas: gas.mul(120).div(100).toNumber(),
          issuedAt,
        },
        {
          to: forwarderTester.address,
          from: alice.address,
          data: relayTxTwo.data!,
          value: 0,
          gas: gas.mul(120).div(100).toNumber(),
          issuedAt,
        },
      ], signature)).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
    })

  })

  describe('revoke', () => {
    const contractsAndToken = async () => {
      const contracts = await loadFixture(deployForwarder);
      const { trustedForwarder, deployer, alice, forwarderTester } = contracts
      const tokenResp = await createToken(trustedForwarder, alice, deployer)
      return {
        ...contracts,
        ...tokenResp,
      }
    }

    it('should remove access for a particular token when sent by alice', async () => {
      const { trustedForwarder, alice, deployer, forwarderTester, signature, issuedAt } = await loadFixture(contractsAndToken);
      await trustedForwarder.connect(alice).revoke(alice.address, deployer.address, issuedAt, signature)

      const relayTx = await forwarderTester.populateTransaction.testSender()
      if (!relayTx.data || !relayTx.to) {
        throw new Error('no data')
      }

      const gas = await alice.estimateGas({ ...relayTx, from: alice.address })

      await expect(trustedForwarder.execute({
        to: relayTx.to,
        from: alice.address,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
        issuedAt,
      }, signature)).to.be.revertedWith("TrustedForwarder: Token Revoked")
    })

    it("should remove access for a particular token when sent by relayer", async () => {
      const { trustedForwarder, alice, deployer, forwarderTester, signature, issuedAt } = await loadFixture(contractsAndToken);
      await trustedForwarder.connect(deployer).revoke(alice.address, deployer.address, issuedAt, signature)

      const relayTx = await forwarderTester.populateTransaction.testSender()
      if (!relayTx.data || !relayTx.to) {
        throw new Error('no data')
      }

      const gas = await alice.estimateGas({ ...relayTx, from: alice.address })

      await expect(trustedForwarder.execute({
        to: relayTx.to,
        from: alice.address,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
        issuedAt,
      }, signature)).to.be.revertedWith("TrustedForwarder: Token Revoked")
    })
  })

});
