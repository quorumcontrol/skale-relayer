import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import KasumahRelayer from "../src/KasumahRelayer";
import { wrapContract } from 'kasumah-relay-wrapper'
import { ForwarderTester } from "../typechain-types";

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
    const relayer = new KasumahRelayer(trustedForwarder, deployer, alice)

    const wrapped = wrapContract<ForwarderTester>(forwarderTester, relayer)

    await expect(wrapped.testSender()).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
  });

  it('multisends', async () => {
    const { trustedForwarder, deployer, alice, forwarderTester } = await loadFixture(deployForwarder);
    const relayer = new KasumahRelayer(trustedForwarder, deployer, alice)

    const tx = await forwarderTester.populateTransaction.testSender()
    await expect(relayer.multisend([tx, tx])).to.emit(forwarderTester, 'MessageSent').withArgs(alice.address)
  })

});
