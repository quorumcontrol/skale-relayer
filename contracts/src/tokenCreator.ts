import { TrustedForwarder } from "../typechain-types"
import { Signer } from 'ethers'

export async function bytesToSignForToken(trustedForwarder: TrustedForwarder, user: Signer, relayer: Signer) {
  const [service, statement, uri, version, chainId, blockNumber] = await Promise.all([
    trustedForwarder.SERVICE(),
    trustedForwarder.STATEMENT(),
    trustedForwarder.URI(),
    trustedForwarder.VERSION(),
    user.getChainId(),
    user.provider!.getBlockNumber()
  ])
  const issuedAt = blockNumber - 1
  const nonce = await trustedForwarder.getNonceAt(issuedAt)

  const stringToSign = service +
    " wants you to sign in with your Ethereum account: " +
    (await user.getAddress()).toLowerCase() +
    "\n\n" +
    statement +
    "\n\n" +
    "URI: " + uri +
    "\n" +
    "Version: " + version +
    "\n" +
    "Chain Id: " + chainId.toString(10) +
    "\n" +
    "Nonce: " + nonce.toHexString() +
    "\n" +
    "Issued At: " + issuedAt.toString(10) +
    "\n" +
    "Request ID: " + (await relayer.getAddress()).toLowerCase()
  return {
    stringToSign,
    issuedAt
  }
}

export async function createToken(trustedForwarder: TrustedForwarder, user: Signer, relayer: Signer) {
  const { stringToSign, issuedAt } = await bytesToSignForToken(trustedForwarder, user, relayer)
  return {
    signature: await user.signMessage(stringToSign),
    issuedAt,
  }
}