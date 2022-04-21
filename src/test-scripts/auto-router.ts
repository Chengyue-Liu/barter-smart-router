import { Interface, LogDescription } from '@ethersproject/abi/lib/interface';
import { Log, TransactionReceipt } from '@ethersproject/abstract-provider';
import { Protocol } from '@uniswap/router-sdk';
import { Pool } from '@uniswap/v3-sdk';
import { BigNumber, ethers } from 'ethers';
import {
  USDC_MATIC,
  USDT_MATIC,
} from '../providers/quickswap/util/token-provider';
import { SwapRoute } from '../routers';
import { getBestRoute } from '../routers/barter-router';
import { routeAmountToString, ROUTER_ADDRESSES } from '../util';
import { TradeType } from '../util/constants';
import { BarterProtocol } from '../util/protocol';

const chainId = 137;
// const rpcUrl = 'https://bsc-dataseed1.defibit.io/';
const rpcUrl =
  'https://polygon-mainnet.infura.io/v3/26b081ad80d646ad97c4a7bdb436a372';
const provider = new ethers.providers.JsonRpcProvider(rpcUrl, chainId);

const wallet = new ethers.Wallet(
  '939ae45116ea2d4ef9061f13534bc451e9f9835e94f191970f23aac0299d5f7a'
);
const signer = wallet.connect(provider);
const routerContract = new ethers.Contract(
  '0x42c75CF9fa49E882324ebf3abFc56b2842b2812F',
  [
    'function multiSwap(uint256[] amountInArr, uint256[] amountOuntMinArr, bytes[] pathArr,address[] routerArr, address to, uint256 deadline, address froms, address tos)',
  ],
  signer
);
const slippage = 3; // thousandth
const protocols = [
  BarterProtocol.UNI_V2,
  BarterProtocol.UNI_V3,
  BarterProtocol.QUICKSWAP,
  BarterProtocol.SUSHISWAP,
  // BarterProtocol.PANCAKESWAP,
];

// const tokenIn = USDT_BNB;
// const tokenOut = USDC_BNB;
const tokenIn = USDT_MATIC;
const tokenOut = USDC_MATIC;
const abiCoder = new ethers.utils.AbiCoder();

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
  // console.log(await doSwap(swapRoute));
}

async function doSwap(swapRoute: SwapRoute): Promise<TransactionReceipt> {
  const [amountInArr, amountOutMinArr, pathArr, routerArr] =
    assembleSwapRequest(swapRoute);
  console.log(pathArr);
  const swapTx = await routerContract.multiSwap(
    amountInArr,
    amountOutMinArr,
    pathArr,
    routerArr,
    wallet.address,
    ethers.constants.MaxUint256,
    tokenIn.address,
    tokenOut.address,
    { gasLimit: 3500000, gasPrice: 70057219557 }
  );

  return swapTx.wait();
}
/**
 * assemble swap request to call barterRouter's multiSwap method.
 * @param swapRoute route from router.route()
 * @returns TBD
 */
export function assembleSwapRequest(swapRoute: SwapRoute) {
  let amountInArr: BigNumber[] = [];
  let amountOutMinArr: BigNumber[] = [];
  let pathArr: string[] = [];
  let routerArray: string[] = [];

  for (let route of swapRoute.route) {
    amountInArr.push(
      ethers.utils.parseUnits(route.amount.toExact(), tokenIn.decimals)
    );
    amountOutMinArr.push(
      ethers.utils
        .parseUnits(route.quote.toExact(), tokenOut.decimals)
        .mul(1000 - slippage)
        .div(1000)
    );
    if (route.protocol != Protocol.V3) {
      let path: string[] = [];
      route.tokenPath.forEach((token) => path.push(token.address));
      pathArr.push(abiCoder.encode(['address[]'], [path]));
      routerArray.push(ROUTER_ADDRESSES[route.platform]);
    } else {
      let typeArr: string[] = [];
      let valueArr: any[] = [];
      const pools: Pool[] = route.route.pools;
      console.log('tokenPath', route.route.tokenPath);
      for (let i = 0; i < pools.length; i++) {
        let pool: Pool = pools[i]!;
        if (i == 0) {
          typeArr = typeArr.concat(['address', 'uint24', 'address']);
          valueArr = valueArr.concat([
            route.route.tokenPath[i]?.address,
            pool.fee,
            route.route.tokenPath[i + 1]?.address,
          ]);
        } else {
          typeArr = typeArr.concat(['uint24', 'address']);
          valueArr = valueArr.concat([
            pool.fee,
            route.route.tokenPath[i * 2]?.address,
          ]);
        }
      }
      routerArray.push(ROUTER_ADDRESSES[route.platform]);
      console.log('type', typeArr);
      console.log('value', valueArr);

      pathArr.push(ethers.utils.solidityPack(typeArr, valueArr));
    }
  }
  return [amountInArr, amountOutMinArr, pathArr, routerArray];
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
