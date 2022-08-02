import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { TrustedForwarder } from "../typechain-types";

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
    const factory = await ethers.getContractFactory("TrustedForwarder");
    const trustedForwarder = await factory.deploy()

    const ForwarderTester = await ethers.getContractFactory("ForwarderTester")
    const forwarderTester = await ForwarderTester.deploy(trustedForwarder.address)
    return { trustedForwarder, deployer, alice, forwarderTester }
  }

  describe("verify", function () {
    it("should verify a proper signature", async function () {
      const { trustedForwarder, alice, forwarderTester } = await loadFixture(deployForwarder);
      const chainId = await alice.getChainId()
      const string = SERVICE +
        " wants you to sign in with your Ethereum account: " +
        alice.address.toLowerCase() +
        "\n\n" +
        STATEMENT +
        "\n\n" +
        "URI: " + URI +
        "\n" +
        "Version: " + VERSION +
        "\n" +
        "Chain Id: " + chainId.toString(10) +
        "\n" +
        "Nonce: " + await trustedForwarder.getNonce()

      console.log('JS string to sign: ', string)

      const sig = await alice.signMessage(string)
      await expect(trustedForwarder.verify({
        to: forwarderTester.address,
        from: alice.address,
        value: 0,
        gas: 0,
        nonce: await trustedForwarder.getNonce(),
        data: Buffer.from('0')
      }, sig)).to.not.be.reverted
    });

  });
});
