import { Interface, LogDescription } from '@ethersproject/abi/lib/interface';
import { Log, TransactionReceipt } from '@ethersproject/abstract-provider';
import { BigNumber, ethers, Signer } from 'ethers';
import {
  DAI_MATIC,
  USDC_MATIC,
} from '../providers/quickswap/util/token-provider';
import { SwapRoute } from '../routers';
import { getBestRoute } from '../routers/barter-router';
import { routeAmountToString } from '../util';
import { TradeType } from '../util/constants';
import { BarterProtocol } from '../util/protocol';

const chainId = 137;
// const rpcUrl = 'https://bsc-dataseed1.defibit.io/';
const rpcUrl =
  'https://polygon-mainnet.infura.io/v3/26b081ad80d646ad97c4a7bdb436a372';
const provider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);

const protocols = [
  BarterProtocol.UNI_V2,
  BarterProtocol.UNI_V3,
  BarterProtocol.QUICKSWAP,
  BarterProtocol.PANCAKESWAP,
];

// const tokenIn = USDT_BNB;
// const tokenOut = USDC_BNB;
const tokenIn = DAI_MATIC;
const tokenOut = USDC_MATIC;
async function main() {
  const start = Date.now();
  const swapRoute = await getBestRoute(
    chainId,
    provider,
    protocols,
    '80000000',
    tokenIn.address,
    tokenIn.decimals,
    tokenOut.address,
    tokenOut.decimals,
    TradeType.EXACT_INPUT,
    tokenIn.symbol,
    tokenIn.name,
    tokenOut.symbol,
    tokenOut.name
  );

  if (swapRoute == null) {
    return;
  }

  let sum = 0;
  for (let route of swapRoute.route) {
    console.log(`${routeAmountToString(route)} = ${route.quote.toExact()})}`);
    sum += parseFloat(route.quote.toExact());
  }
  console.log('total get: ', sum);
  console.log('time: ', Date.now() - start);
}

export async function assembleSwapRequest(
  swapRoute: SwapRoute,
  signer: Signer,
  tokenInAddr: string,
  tokenOutAddr: string,
  amount: string,
  to: string,
  dealdline: BigNumber
) {
  let amountInArr: BigNumber[] = [];
  let amountOutMinArr: BigNumber[] = [];
  let pathArr = [];
  let routerArray: string[] = [];

  for (let route of swapRoute.route) {
    console.log(route);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function parseEventFromTxReceipt(
  receipt: TransactionReceipt,
  jsonAbiArray: Array<any>
): LogDescription[] {
  let parsedLogs: LogDescription[] = new Array();
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
