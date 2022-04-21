import { Log, TransactionReceipt } from '@ethersproject/abstract-provider';
import '@nomiclabs/hardhat-ethers';
import { ethers } from 'ethers';
import { Interface } from 'ethers/lib/utils';
const provider = new ethers.providers.JsonRpcProvider(secret.rpc);
const failedTxhash =
  '0x5c3eb07b7087a4a75d76c1589f4202b8c637e7b23c375c4ba6999a57f0ff4618';
const successTxHash =
  '0x70b033aa413be8d2ee340f9dbe90a96acfb23491a2c3f9343db280f4edfab6fe';

async function main() {
  // check if transaction successed
  let [success, reason] = await getRevertReason(provider, successTxHash);
  if (success) {
    console.log('successful transaction');
  } else {
    console.log('transaction failed, revert reason: ' + reason);
  }

  console.log(
    'transaction logs: ',
    await parseEventFromTx(successTxHash, [jsonAbi])
  );
}

export async function parseEventFromTx(
  txHash: string,
  jsonAbiArray: Array<any>
) {
  let receipt: TransactionReceipt = await provider.getTransactionReceipt(
    txHash
  );
  let parsedLogs = new Array();
  // console.log(receipt.logs)
  let logs: Log[] = receipt.logs;
  let fullSignatures = new Array<string>();
  for (let jsonAbi of jsonAbiArray) {
    let iface = new Interface(jsonAbi);
    let signatures = iface.format(
      ethers.utils.FormatTypes.full
    ) as Array<string>;
    fullSignatures = fullSignatures.concat(signatures);
  }
  let iface = new Interface(fullSignatures);
  for (let log of logs) {
    try {
      let parsedLog = iface.parseLog(log);
      parsedLogs.push(parsedLog);
    } catch (err) {
      console.log(err);
    }
  }
  return parsedLogs;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
