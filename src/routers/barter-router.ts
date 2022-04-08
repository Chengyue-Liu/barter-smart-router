import { Token, TradeType } from '@uniswap/sdk-core';
import { ethers, providers } from 'ethers';
import JSBI from 'jsbi';
import { AlphaRouter, AlphaRouterConfig } from '../routers';
import { CurrencyAmount } from '../util/amounts';
import { TradeType as VTradeType } from '../util/constants';
import { BarterProtocol } from '../util/protocol';
import { BSCAlphaRouter } from './alpha-router/bsc-alpha-router';
import { SwapOptions, SwapRoute } from './router';

export async function getBestRoute(
  chainId: number,
  provider: providers.BaseProvider,
  protocols: BarterProtocol[],
  swapAmountHumanReadable: string,
  tokenInAddress: string,
  tokenInDecimal: number,
  tokenOutAddress: string,
  tokenOutDecimal: number,
  tradeType: VTradeType,
  tokenInSymbol?: string,
  tokenInName?: string,
  tokenOutSymbol?: string,
  tokenOutName?: string
): Promise<SwapRoute | null> {
  const router =
    chainId === 56
      ? new BSCAlphaRouter({
          chainId: chainId,
          provider: provider,
        })
      : new AlphaRouter({
          chainId: chainId,
          provider: provider,
        });

  const tokenIn = new Token(
    chainId,
    tokenInAddress,
    tokenInDecimal,
    tokenInSymbol,
    tokenInName
  );

  const tokenOut = new Token(
    chainId,
    tokenOutAddress,
    tokenOutDecimal,
    tokenOutSymbol,
    tokenOutName
  );

  const amountInRaw = ethers.utils.parseUnits(
    swapAmountHumanReadable,
    tokenIn.decimals
  );
  const inAmount = CurrencyAmount.fromRawAmount(
    tokenIn,
    JSBI.BigInt(amountInRaw)
  );

  const routerConfig: Partial<AlphaRouterConfig> = {
    protocols: protocols,
  };

  const swapRoute = await router.route(
    inAmount,
    tokenOut,
    tradeType === VTradeType.EXACT_INPUT
      ? TradeType.EXACT_INPUT
      : TradeType.EXACT_OUTPUT,
    {} as SwapOptions,
    routerConfig
  );

  return swapRoute;
}
