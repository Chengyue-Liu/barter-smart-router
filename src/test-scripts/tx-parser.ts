import { Log, TransactionReceipt } from '@ethersproject/abstract-provider';
import { ethers } from 'ethers';
import { Interface } from 'ethers/lib/utils';
import jsonAbi from './abi.json';
const chainId = 137;
// const rpcUrl = 'https://bsc-dataseed1.defibit.io/';
const rpcUrl =
  'https://polygon-mainnet.infura.io/v3/26b081ad80d646ad97c4a7bdb436a372';
const provider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
const successTxHash =
  '0x214408f08c610503236691df3314e2837333e2902432f58ca8135f45c56a5f45';

async function main() {
  console.log(await showHumanReadableAbi(jsonAbi));
  //   console.log(await parseEventFromTx(successTxHash, [jsonAbi]));
}
export async function showHumanReadableAbi(jsonAbi: any) {
  const iface = new ethers.utils.Interface(jsonAbi);
  console.log(iface.format(ethers.utils.FormatTypes.full));
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
