import { TrustedForwarder } from "../typechain-types"
import { BigNumber, BigNumberish, BytesLike, Signer } from 'ethers'

const MIN_VALID_V_VALUE = 27;

export interface PreTokenData {
  stringToSign: BytesLike
  issuedAt: number
  sessionExpiry?: BigNumberish
}

export interface Token {
  signature: BytesLike
  issuedAt: number
  sessionExpiry: BigNumberish
}

export async function bytesToSignForToken(trustedForwarder: TrustedForwarder, user: Signer, relayer: Signer, sessionExpiry?:BigNumberish):Promise<PreTokenData> {
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

  let stringToSign = service +
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

  if (sessionExpiry && BigNumber.from(sessionExpiry).gt(0)) {
    stringToSign =
      stringToSign +
      "\nSession Length: " + BigNumber.from(sessionExpiry).toString()
  }

  return {
    stringToSign,
    issuedAt,
    sessionExpiry,
  }
}

// see https://github.com/gnosis/safe-react/blob/dev/src/logic/safe/transactions/offchainSigner/utils.ts#L26
export const adjustV = (signature: string): string => {
  let sigV = parseInt(signature.slice(-2), 16);

  // Metamask with ledger returns V=0/1 here too, we need to adjust it to be ethereum's valid value (27 or 28)
  if (sigV < MIN_VALID_V_VALUE) {
    sigV += MIN_VALID_V_VALUE;
  }

  return signature.slice(0, -2) + sigV.toString(16);
};

/**
 * createToken does not do any https calls out except for the sign message, this makes it useable for mobile browsers
 * as they will often pop the app store if there are any extraneous requests besides the direct call to wallet connect.
 * see: https://github.com/MetaMask/metamask-mobile/pull/4167
 * @param preTokenData
 * @param user 
 * @returns a sequence of bytes
 */
export async function createToken({ stringToSign, issuedAt, sessionExpiry }:PreTokenData, user:Signer):Promise<Token> {
  return {
    signature: adjustV(await user.signMessage(stringToSign)),
    issuedAt,
    sessionExpiry: sessionExpiry || 0
  }
}

export async function getBytesAndCreateToken(trustedForwarder: TrustedForwarder, user: Signer, relayer: Signer, sessionExpiry?: BigNumberish) {
  const preTokenData = await bytesToSignForToken(trustedForwarder, user, relayer, sessionExpiry)
  return createToken(preTokenData, user)
}