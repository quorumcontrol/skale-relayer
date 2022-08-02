import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { text } from "stream/consumers";
import { TrustedForwarder } from "../typechain-types";

const SERVICE = "service.invalid";
const STATEMENT = "I accept the ServiceOrg Terms of Service: https://service.invalid/tos";
const URI = "https://service.invalid/login";
const VERSION = "1";

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T

type SignerWithAddress = ThenArg<ReturnType<typeof ethers.getSigner>>

describe("TrustedForwarder", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployForwarder() {
    const [deployer, alice] = await ethers.getSigners()

    const DiceRoller = await ethers.getContractFactory('TestDiceRoller')
    const diceRoller = await DiceRoller.deploy()

    const factory = await ethers.getContractFactory("TrustedForwarder");
    const trustedForwarder = await factory.deploy(diceRoller.address)

    const ForwarderTester = await ethers.getContractFactory("ForwarderTester")
    const forwarderTester = await ForwarderTester.deploy(trustedForwarder.address)
    return { trustedForwarder, deployer, alice, forwarderTester }
  }

  async function createToken(trustedForwarder:TrustedForwarder, user:SignerWithAddress, relayer:SignerWithAddress) {
    const chainId = await user.getChainId()
    const issuedAt = (await user.provider!.getBlockNumber()) - 1
    console.log('js block: ', issuedAt)
    const nonce = await trustedForwarder.getNonceAt(issuedAt)
    const string = SERVICE +
      " wants you to sign in with your Ethereum account: " +
      user.address.toLowerCase() +
      "\n\n" +
      STATEMENT +
      "\n\n" +
      "URI: " + URI +
      "\n" +
      "Version: " + VERSION +
      "\n" +
      "Chain Id: " + chainId.toString(10) +
      "\n" +
      "Nonce: " + nonce.toHexString() +
      "\n" +
      "Issued At: " + issuedAt.toString(10) +
      "\n" +
      "Request ID: " + relayer.address.toLowerCase()

    // console.log('JS string to sign: ', string)

    return {
      signature: await user.signMessage(string),
      issuedAt,
    }
  }

  describe("verify", function () {
    it("should verify a proper signature", async function () {
      const { trustedForwarder, deployer, alice } = await loadFixture(deployForwarder);
      const { signature, issuedAt } = await createToken(trustedForwarder, alice, deployer)
      await expect(trustedForwarder.verify(alice.address, issuedAt, signature)).to.not.be.reverted
    });
  });

  describe('execute', () => {
    it('should relay a transaction', async () => {
      const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
      const { signature, issuedAt } = await createToken(trustedForwarder, alice, deployer)

      const relayTx = await forwarderTester.populateTransaction.testSender()
      if (!relayTx.data || !relayTx.to) {
        throw new Error('no data')
      }

      const gas = await alice.estimateGas({...relayTx, from: alice.address})

      await expect(trustedForwarder.execute({
        to: relayTx.to,
        from: alice.address,
        data: relayTx.data,
        value: 0,
        gas: gas.mul(120).div(100).toNumber(),
        issuedAt,
      }, signature)).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
    })
  })

});
