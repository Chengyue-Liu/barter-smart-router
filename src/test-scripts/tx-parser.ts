import { Log, TransactionReceipt } from '@ethersproject/abstract-provider';
import { ethers } from 'ethers';
import { Interface, ParamType } from 'ethers/lib/utils';
import jsonAbi from './abi.json';
const chainId = 137;
// const rpcUrl = 'https://bsc-dataseed1.defibit.io/';
const rpcUrl =
  'https://polygon-mainnet.infura.io/v3/26b081ad80d646ad97c4a7bdb436a372';
const provider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);
const successTxHash =
  '0x214408f08c610503236691df3314e2837333e2902432f58ca8135f45c56a5f45';

async function main() {
  //   console.log(await showHumanReadableAbi(jsonAbi));
  const [parsedLogs, rawLogs] = await parseEventFromTx(successTxHash, [
    jsonAbi,
  ]);
  if (parsedLogs === undefined || rawLogs === undefined) {
    return;
  }
  for (let i = 0; i < parsedLogs.length; i++) {
    const parsedLog = parsedLogs[i];
    const rawLog = rawLogs[i];
    console.log('log index: ' + rawLog?.logIndex);
    console.log('contract address: ' + rawLog?.address);
    console.log('tx hash: ' + rawLog?.transactionHash);
    console.log(
      'signature: ' +
        formatSignature(parsedLog.signature, parsedLog.eventFragment.inputs)
    );
    // console.log('topic: ', parsedLog.topic);
    let j = 0;
    (parsedLog.eventFragment.inputs as ParamType[]).forEach((p) => {
      console.log(p.name + ': ' + parsedLog.args[j]);
      j++;
    });
    console.log('');
  }
}

export function formatSignature(signature: string, inputs: any[]): string {
  let ret = '';
  const split: string[] = signature.split(',');

  for (let i = 0; i < inputs.length; i++) {
    if (i === inputs.length - 1) {
      let paramType = split.slice(i).join(',');
      ret = ret + paramType.replace(')', '') + ' ' + inputs[i]?.name + ')';
    } else {
      ret += split[i] + ' ' + inputs[i]?.name + ', ';
    }
  }
  return ret;
}
export async function showHumanReadableAbi(jsonAbi: any) {
  const iface = new ethers.utils.Interface(jsonAbi);
  console.log(iface.format(ethers.utils.FormatTypes.full));
}

export async function parseEventFromTx(
  txHash: string,
  jsonAbiArray: Array<any>
): Promise<[ethers.utils.Result, Log[]]> {
  let receipt: TransactionReceipt = await provider.getTransactionReceipt(
    txHash
  );
  let parsedLogs = new Array();
  let rawLogs = new Array();

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
      rawLogs.push(log);
    } catch (err) {
      //   console.log(err);
    }
  }
  return [parsedLogs, rawLogs];
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
