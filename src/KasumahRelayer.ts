import { Contract, ContractTransaction, PopulatedTransaction, Signer } from "ethers";
import { TrustedForwarder } from "../typechain-types";
import { Relayer } from "kasumah-relay-wrapper/dist/src/relayers";
import { Token } from "./tokenCreator";
import EventEmitter from "events"

export const SIGNATURE_INVALID = 'InvalidToken'

class KasumahRelayer extends EventEmitter implements Relayer {

  forwarder: TrustedForwarder
  user: Signer
  relayer: Signer
  token: Token

  constructor(forwarder: TrustedForwarder, relayer: Signer, user: Signer, token:Token) {
    super()
    this.forwarder = forwarder
    this.user = user
    this.relayer = relayer
    this.token = token
  }

  async multisend(txs:PopulatedTransaction[]):Promise<ContractTransaction> {
    const { issuedAt, signature } = this.token
    const userAddress = await this.user.getAddress()
    const forwardRequests:TrustedForwarder.ForwardRequestStruct[] = txs.map((tx) => {
      return {
        to: tx.to!,
        from: userAddress,
        data: tx.data!,
        gas: tx.gasLimit || 9500000,
        value: tx.value || 0,
        sessionExpiry: this.token.sessionExpiry,
        issuedAt
      }
    })
    return this.forwarder.multiExecute(forwardRequests, signature)
  }

  async transmit(to:Contract, funcName:string, ...args:any):Promise<ContractTransaction> {

    // TODO: use estimateGas
    const lastArg = args.slice(-1)[0]
    let newArgs = args
    if (lastArg && (lastArg.hasOwnProperty('value') || lastArg.hasOwnProperty('gasLimit'))) {
      lastArg.gasLimit ||= 1_000_000
      newArgs = args.slice(0,-1).concat([lastArg])
    } else {
      newArgs = [...args,{
        gasLimit: 1_000_000
      }]
    }

    const { issuedAt, signature } = this.token

    const relayTx = await to.populateTransaction[funcName](...newArgs)

    const tx = this.forwarder.execute({
      to: to.address,
      from: await this.user.getAddress(),
      data: relayTx.data!,
      gas: newArgs.slice(-1)[0].gasLimit,
      value: newArgs.slice(-1)[0].value || 0,
      sessionExpiry: this.token.sessionExpiry,
      issuedAt
    }, signature, {
      gasLimit: 3_000_000
    })

    tx.then((tx) => tx.wait()).catch((err) => {
      if (err.toString().includes('signature does not match request')) {
        this.emit(SIGNATURE_INVALID)
      }
    })

    return tx
  }

}

export default KasumahRelayer
