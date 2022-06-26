import { EthereumRpcError } from "eth-rpc-errors";

export function handleError(e: EthereumRpcError<unknown>): void {
  // tries to parse Internal JSON RPC error, see https://eips.ethereum.org/EIPS/eip-1474#error-codes
  if (e.code === -32603) {
    e = e.data as EthereumRpcError<unknown>;
  }

  const msg = e.message || "Something went wrong.";
  // checks if the user has metamask installed
  if (msg.includes("missing provider") || msg.includes("No provider found")) {
    throw new Error(
      "Please install the MetaMask extension. If you are on mobile, open your MetaMask app and browse to this page."
    );
  }

  // ideally we would check for the error code here, but the same error code: -32000 (Bad Input)
  // is used for more than one error type
  if (msg.toLowerCase().includes("err: insufficient funds for gas * price + value")) {
    throw new Error("Your wallet does not have enough balance.");
  }

  if (msg.toLowerCase().includes("unauthorized to join the presale")) {
    throw new Error("You are not in the whitelist.");
  }//Not Authorize for presale

  if (msg.toLowerCase().includes("exceed the limit")) {
    throw new Error("You reach max minted NFTs per address.");
  }//Have minted presale spot


  if (msg.toLowerCase().includes("sale has not been started")) {
    throw new Error("Sale has not been started.");
  }//

  if ((e.code as unknown as string) === "CALL_EXCEPTION") {
    throw new Error("Please make sure you are connected to the right network.");
  }

  if(msg === 'Something went wrong.') {
    console.log('Something went wrong')
    return;
  }

  //wallet cancel error
  if(msg.toLowerCase() === 'user rejected' || msg.toLowerCase() === 'user closed modal' || msg.toLowerCase() === 'user denied account authorization' || msg.toLowerCase() === 'accounts received is empty') {
    console.log('User doesnt want to connect')
    return;
  }

  throw Error(msg);
}
