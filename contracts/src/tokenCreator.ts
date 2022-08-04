import { TrustedForwarder } from "../typechain-types"
import { BytesLike, Signer } from 'ethers'

export interface PreTokenData {
  stringToSign: BytesLike
  issuedAt: number
}

export interface Token {
  signature: BytesLike
  issuedAt: number
}

export async function bytesToSignForToken(trustedForwarder: TrustedForwarder, user: Signer, relayer: Signer):Promise<PreTokenData> {
  const [service, statement, uri, version, chainId, blockNumber] = await Promise.all([
    trustedForwarder.SERVICE(),
    trustedForwarder.STATEMENT(),
    trustedForwarder.URI(),
    trustedForwarder.VERSION(),
    relayer.getChainId(),
    relayer.provider!.getBlockNumber()
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

/**
 * createToken does not do any https calls out except for the sign message, this makes it useable for mobile browsers
 * as they will often pop the app store if there are any extraneous requests besides the direct call to wallet connect.
 * see: https://github.com/MetaMask/metamask-mobile/pull/4167
 * @param preTokenData
 * @param user 
 * @returns a sequence of bytes
 */
export async function createToken({ stringToSign, issuedAt }:PreTokenData, user:Signer):Promise<Token> {
  return {
    signature: await user.signMessage(stringToSign),
    issuedAt,
  }
}

export async function getBytesAndCreateToken(trustedForwarder: TrustedForwarder, user: Signer, relayer: Signer) {
  const preTokenData = await bytesToSignForToken(trustedForwarder, user, relayer)
  return createToken(preTokenData, user)
}