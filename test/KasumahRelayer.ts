import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import KasumahRelayer, { SIGNATURE_INVALID } from "../src/KasumahRelayer";
import { wrapContract } from 'kasumah-relay-wrapper'
import { ForwarderTester } from "../typechain-types";
import { getBytesAndCreateToken } from '../src/tokenCreator'
import { mine } from "@nomicfoundation/hardhat-network-helpers";

const SERVICE = "service.invalid";
const STATEMENT = "I accept the ServiceOrg Terms of Service: https://service.invalid/tos";
const URI = "https://service.invalid/login";
const VERSION = "1";

describe("KasumahRelayer", function () {
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

  it("works as a wrapped relayer", async function () {
    const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
    const token = await getBytesAndCreateToken(trustedForwarder, alice, deployer) 
    const relayer = new KasumahRelayer(trustedForwarder, deployer, alice, token)

    const wrapped = wrapContract<ForwarderTester>(forwarderTester, relayer)

    await expect(wrapped.testSender()).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
  });

  it('multisends', async () => {
    const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
    const token = await getBytesAndCreateToken(trustedForwarder, alice, deployer)
    const relayer = new KasumahRelayer(trustedForwarder, deployer, alice, token)

    const tx = await forwarderTester.populateTransaction.testSender()
    await expect(relayer.multisend([tx, tx])).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
  })

  it('works with an expiry', async () => {
    const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
    const expiry = 10
    const token = await getBytesAndCreateToken(trustedForwarder, alice, deployer, expiry) 
    const relayer = new KasumahRelayer(trustedForwarder, deployer, alice, token)
    return new Promise(async (resolve) => {
      relayer.on(SIGNATURE_INVALID, resolve)
      const wrapped = wrapContract<ForwarderTester>(forwarderTester, relayer)

      await expect(wrapped.testSender()).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
  
      mine(10)
  
      await expect(wrapped.testSender()).to.emit(forwarderTester, 'MessageSent').to.be.revertedWith('TrustedForwarder: signature does not match request')  
    })
  })
});
