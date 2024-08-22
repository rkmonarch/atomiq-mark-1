import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Keypair,
  Signer,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  SolanaChains,
  SolanaSwapData,
  ToBTCLNSwap,
  FromBTCLNSwap,
  SolanaSwapper,
  ToBTCSwap,
  FromBTCSwap,
} from "sollightning-sdk";
import { createNodeJSSwapperOptions } from "sollightning-sdk/dist/NodeJSSwapperOptions";

//const _solanaRpcUrl = "https://api.mainnet-beta.solana.com";
const _solanaRpcUrl = "https://api.devnet.solana.com";

let _network: "DEVNET" | "MAINNET";
let swapper: SolanaSwapper;

const keypair = Keypair.fromSecretKey(
  Buffer.from(
    "secret_key", // secret key
    "hex"
  )
);
console.log("publicKey: " + keypair.publicKey.toBase58());

const connection = new Connection(_solanaRpcUrl, "confirmed");
// const anchorProvider = new AnchorProvider(connection, new Wallet(keypair), {
//   preflightCommitment: "confirmed",
// });

const publicKey = new PublicKey("3YKGasCtfeMHNR5CrFB4Y5sL6b5ukvzSoTpcUGpFJs36");

const mockWallet = {
  publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(
    tx: T
  ): Promise<T> => {
    return tx;
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> => {
    return txs;
  },
};

const anchorProvider = new AnchorProvider(connection, mockWallet as any, {
  preflightCommitment: "confirmed",
});

async function airdrop() {
  await anchorProvider.connection.requestAirdrop(keypair.publicKey, 1000000000);
  console.log("Airdrop got");
  await balance();
}

async function balance() {
  const balance = await anchorProvider.connection.getBalance(keypair.publicKey);
  console.log("Lamport balance: " + balance);
}

export async function initialize() {
  console.log("Atomiq initialized");
  //Defines max swap price difference to the current market price as fetched from CoinGecko API tolerance in PPM (1000000 = 100%)
  const _swapDifferenceTolerance = new BN(2500); //Max allowed difference 0.25%

  //Set swapper options
  _network = "DEVNET"; //"DEVNET" or "MAINNET"

  //For NodeJS environment (using filesystem storage)
  const _options = createNodeJSSwapperOptions(
    _network,
    _swapDifferenceTolerance
  ); //import from "sollightning-sdk/dist/NodeJSSwapperOptions"

  //Create the swapper instance
  swapper = new SolanaSwapper(anchorProvider, _options);
  //Initialize the swapper
  await swapper.init();

  return {
    status: "success",
    message: "Atomiq initialized successfully",
  };
}

export async function payLN() {
  ///////////////////////////////////////////////////////////////
  /// Swap Solana -> Bitcoin lightning (using bolt11 invoice) ///
  ///////////////////////////////////////////////////////////////

  const _useToken: string = SolanaChains[_network].tokens.WSOL; //Token to swap from
  const _bolt11invoice: string =
    "lntb200u1pnvvjr9pp5f9rz69j50u86pjdk55dptz3lpukn3l6agp5xvrmdzvrx0lghhmaqcqpjsp532dlc3uc49xhk6rptjc9rgm8caqmc2c8gzlxnngj789jmd2jxwwq9q7sqqqqqqqqqqqqqqqqqqqsqqqqqysgqdqqmqz9gxqyjw5qrzjqwfn3p9278ttzzpe0e00uhyxhned3j5d9acqak5emwfpflp8z2cnfluavlwplj5ju5qqqqlgqqqqqeqqjq362j2kv2g7u0zgdjjhxv0dvqu4w4mjhs6f5d33cwc6ty58r5xus5ddfzsvlln2llaus9pcvfd6m5dshu5x6jtw3jf9ausrfrz42uflgq5m60dv";

  //Create the swap: swapping _useToken to Bitcoin lightning network, sending _amount of satoshis to _lnurlOrIdentifier
  console.log("Creating swap...");
  const swap: ToBTCLNSwap<SolanaSwapData> = await swapper.createToBTCLNSwap(
    new PublicKey(_useToken),
    _bolt11invoice
  );

  //Get the amount required to pay and fee
  const amountToBePaid: BN = swap.getInAmount(); //Amount to be paid in the SPL token on Solana (including fee), in base units (no decimals)
  const fee: BN = swap.getFee(); //Swap fee paid in the SPL token on Solana (already included in the getInAmount()), in base units (no decimals)

  console.log("Paying amount: ", amountToBePaid.toString());
  console.log("Fee: ", fee.toString());

  //Get swap expiration time
  const expiry: number = swap.getExpiry(); //Expiration time of the swap in UNIX milliseconds, swap needs to be initiated before this time

  //Initiate and pay for the swap
  console.log("Swap committing...");
  await swap.commit();
  console.log("Swap committed...");

  //Wait for the swap to conclude
  const result: boolean = await swap.waitForPayment();
  console.log("Payment result: ", result);
  if (!result) {
    //Swap failed, money can be refunded
    await swap.refund();
    console.log("Payment refunded");
  } else {
    //Swap successful
    console.log("Payment success");
  }
}

export async function payViaLNURL() {
  //////////////////////////////////////////////////////
  /// Swap Solana -> Bitcoin lightning (using LNURL) ///
  //////////////////////////////////////////////////////

  const _useToken: string = SolanaChains[_network].tokens.USDC; //Token to swap from
  const _lnurlOrIdentifier: string =
    "lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhkx6rfvdjx2ctvxyesuk0a27"; //Destination LNURL-pay or readable identifier
  const _amount: BN = new BN(1000); //Amount of satoshis to send (1 BTC = 100 000 000 satoshis)
  const _comment: string | null = "Hello, Lightning!"; //Optional comment for the payment

  //Create the swap: swapping _useToken to Bitcoin lightning network, sending _amount of satoshis to _lnurlOrIdentifier
  console.log("Creating swap...");
  const swap: ToBTCLNSwap<SolanaSwapData> =
    await swapper.createToBTCLNSwapViaLNURL(
      new PublicKey(_useToken),
      _lnurlOrIdentifier,
      _amount,
      _comment
    );

  //Get the amount required to pay and fee
  const amountToBePaid: BN = swap.getInAmount(); //Amount to be paid in the SPL token on Solana (including fee), in base units (no decimals)
  const fee: BN = swap.getFee(); //Swap fee paid in the SPL token on Solana (already included in the getInAmount()), in base units (no decimals)

  console.log("Paying amount: ", amountToBePaid.toString());
  console.log("Fee: ", fee.toString());

  //Get swap expiration time
  const expiry: number = swap.getExpiry(); //Expiration time of the swap in UNIX milliseconds, swap needs to be initiated before this time

  //Initiate and pay for the swap
  console.log("Swap committing...");
  await swap.commit();
  console.log("Swap committed...");

  //Wait for the swap to conclude
  const result: boolean = await swap.waitForPayment();
  console.log("Payment result: ", result);
  if (!result) {
    //Swap failed, money can be refunded
    await swap.refund();
  } else {
    //Swap successful
    if (swap.hasSuccessAction()) {
      //Contains a success action that should displayed to the user
      const successMessage = swap.getSuccessAction();
      const description: string | undefined = successMessage?.description; //Description of the message
      const text: string | undefined = successMessage?.text; //Main text of the message
      const url: string | undefined = successMessage?.url; //URL link which should be displayed
    }
  }
}

export async function receiveLN() {
  const _useToken: string = SolanaChains[_network].tokens.WSOL; //Token to swap from
  const _amount: BN = new BN(1000); //Amount of satoshis to receive (1 BTC = 100 000 000 satoshis)

  //Create the swap: swapping _amount of satoshis from Bitcoin lightning network to _useToken
  const swap: FromBTCLNSwap<SolanaSwapData> = await swapper.createFromBTCLNSwap(
    new PublicKey(_useToken),
    _amount
  );

  //Get the bitcoin lightning network invoice (the invoice contains pre-entered amount)
  const receivingLightningInvoice: string = swap.getAddress();
  //Get the QR code (contains the lightning network invoice)
  const qrCodeData: string = swap.getQrData(); //Data that can be displayed in the form of QR code

  //Get the amount we will receive on Solana
  const amountToBeReceivedOnSolana: BN = swap.getOutAmount(); //Get the amount we will receive on Solana (excluding fee), in base units (no decimals)
  const fee: BN = swap.getFee(); //Swap fee paid in the SPL token on Solana, in base units (no decimals)

  console.log("Receiving amount: ", amountToBeReceivedOnSolana.toString());
  console.log("Fee: ", fee.toString());

  console.log("RECEIVING LN INVOICE: ", receivingLightningInvoice);

  try {
    //Wait for the payment to arrive
    await swap.waitForPayment();
    //Claim the swap funds
    await swap.commitAndClaim();
  } catch (e) {
    //Error occurred while waiting for payment
    console.error(e);
  }
}

export async function payOnchain() {
  ///////////////////////////////////////
  /// Swap Solana -> Bitcoin on-chain ///
  ///////////////////////////////////////

  const _useToken: string = SolanaChains[_network].tokens.WSOL; //Token to swap from
  const _address: string = "tb1qp2ddjpdrx3qes25kyx2e3jc9wwtp6za8xcfsq4";
  const _amount: BN = new BN(1000);

  //Create the swap: swapping _useToken to Bitcoin lightning network, sending _amount of satoshis to _lnurlOrIdentifier
  console.log("Creating swap...");
  const swap: ToBTCSwap<SolanaSwapData> = await swapper.createToBTCSwap(
    new PublicKey(_useToken),
    _address,
    _amount
  );

  //Get the amount required to pay and fee
  const amountToBePaid: BN = swap.getInAmount(); //Amount to be paid in the SPL token on Solana (including fee), in base units (no decimals)
  const fee: BN = swap.getFee(); //Swap fee paid in the SPL token on Solana (already included in the getInAmount()), in base units (no decimals)

  console.log("Paying amount: ", amountToBePaid.toString());
  console.log("Fee: ", fee.toString());

  //Get swap expiration time
  const expiry: number = swap.getExpiry(); //Expiration time of the swap in UNIX milliseconds, swap needs to be initiated before this time

  //Initiate and pay for the swap
  console.log("Swap committing...");
  const txns: { tx: Transaction; signers: Signer[] }[] = await swap.txsCommit();
  console.log("txns: ", txns);
  await swap.commit();
  console.log("Swap committed...");

  //Wait for the swap to conclude
  const result: boolean = await swap.waitForPayment();
  console.log("Payment result: ", result);
  if (!result) {
    //Swap failed, money can be refunded
    await swap.refund();
    console.log("Payment refunded");
  } else {
    //Swap successful
    console.log("Payment success, txId: " + swap.getTxId());
  }
}

export async function receiveOnchain() {
  ///////////////////////////////////////
  /// Swap Bitcoin on-chain -> Solana ///
  ///////////////////////////////////////
  const _useToken: string = SolanaChains[_network].tokens.WSOL; //Token to swap from
  const _amount: BN = new BN(10000); //Amount of satoshis to receive (1 BTC = 100 000 000 satoshis)

  //Create the swap: swapping _amount of satoshis of Bitcoin on-chain to _useToken
  console.log("Creating swap...");
  const swap: FromBTCSwap<SolanaSwapData> = await swapper.createFromBTCSwap(
    new PublicKey(_useToken),
    _amount
  );

  //Get the amount required to pay, amount to be received and fee
  const amountToBePaidOnBitcoin: BN = swap.getInAmount(); //The amount to be received on bitcoin on-chain address, the amount MUST match! In satoshis (no decimals)
  const amountToBeReceivedOnSolana: BN = swap.getOutAmount(); //Get the amount we will receive on Solana (excluding fee), in base units (no decimals)
  const fee: BN = swap.getFee(); //Swap fee paid in the SPL token on Solana, in base units (no decimals)

  //Get swap offer expiration time
  const expiry: number = swap.getExpiry(); //Expiration time of the swap offer in UNIX milliseconds, swap needs to be initiated before this time

  //Get security deposit amount (amount of SOL that needs to be put down to rent the liquidity from swap intermediary), you will get this deposit back if you successfully conclude the swap
  const securityDeposit: BN = swap.getSecurityDeposit();
  //Get claimer bounty (amount of SOL reserved as a reward for watchtowers to claim the swap on your behalf in case you go offline)
  const claimerBounty: BN = swap.getClaimerBounty();

  //Once client is happy with swap offer
  console.log("Swap committing...");
  await swap.commit();
  console.log("Swap committed...");

  //Get the bitcoin address and amount required to be sent to that bitcoin address
  const receivingAddressOnBitcoin = swap.getAddress();
  //Get the QR code (contains the address and amount)
  const qrCodeData = swap.getQrData(); //Data that can be displayed in the form of QR code
  //Get the timeout (in UNIX millis), the transaction should be made in under this timestamp, and with high enough fee for the transaction to confirm quickly
  const expiryTime = swap.getTimeoutTime();

  console.log("Receiving amount: ", amountToBeReceivedOnSolana.toString());
  console.log("Fee: ", fee.toString());
  console.log("Security deposit: ", securityDeposit.toString());
  console.log("Claimer bounty: ", claimerBounty.toString());

  console.log("RECEIVING BTC ADDRESS: ", receivingAddressOnBitcoin);

  try {
    //Wait for the payment to arrive
    await swap.waitForPayment(
      undefined,
      undefined,
      (txId: string, confirmations: number, targetConfirmations: number) => {
        //Updates about the swap state, txId, current confirmations of the transaction, required target confirmations
        console.log(
          "Swap state change, txId: " +
            txId +
            " confirmations: " +
            confirmations +
            " targetConfirmations: " +
            targetConfirmations
        );
      }
    );
  } catch (e) {
    //Error occurred while waiting for payment
    console.error(e);
    return;
  }

  //Try claim the swap funds ourselves, swaps are generally processed automatically by watchtowers, but to stay fully
  // trustless the client can also claim all by himself
  try {
    if (swap.isClaimable()) {
      //Check if the swap is still claimable (and not claimed already by a watchtower)
      await swap.claim();
      console.log("Success: claimed manually!");
    } else {
      console.log("Success: claimed by watchtower!");
    }
  } catch (e) {
    //Claim txns might error because txns might be reverted if the watchtower's claim txns claim the swap before our txns could
    if (swap.isFinished()) {
      //Check if the swap is finished (claimed) and probably was claimed by the watchtower
      console.log(
        "Success: tried to claim swap ourselves, but was instead claimed by the watchtower!"
      );
      return;
    }
    console.error(e);
  }
}

async function main() {
  await initialize();
  // do an action

  // await payLN();

  // await payOnchain();
}

main();
