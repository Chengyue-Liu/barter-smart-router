import {
  ChainId,
  Currency,
  CurrencyAmount,
  ETHER,
  InsufficientInputAmountError,
  InsufficientReservesError,
  Token,
  TokenAmount,
  WETH,
} from '@davidwgrossman/quickswap-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { BigNumber } from 'ethers';
import invariant from 'tiny-invariant';
import { QuickV2Route } from '../../../routers/router';
import { log } from '../../../util/log';
import { routeToString } from '../../../util/routes';

// Quotes can be null (e.g. pool did not have enough liquidity).
export type QuickV2AmountQuote = {
  amount: CurrencyAmount;
  quote: BigNumber | null;
};

export type V2RouteWithQuotes = [QuickV2Route, QuickV2AmountQuote[]];

export interface IQuickV2QuoteProvider {
  getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: QuickV2Route[]
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }>;

  getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: QuickV2Route[]
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }>;
}
/**
 * Computes quotes for V2 off-chain. Quotes are computed using the balances
 * of the pools within each route provided.
 *
 * @export
 * @class V2QuoteProvider
 */
export class QuickV2QuoteProvider implements IQuickV2QuoteProvider {
  constructor() {}

  public async getQuotesManyExactIn(
    amountIns: CurrencyAmount[],
    routes: QuickV2Route[]
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }> {
    return this.getQuotes(amountIns, routes, TradeType.EXACT_INPUT);
  }

  public async getQuotesManyExactOut(
    amountOuts: CurrencyAmount[],
    routes: QuickV2Route[]
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }> {
    return this.getQuotes(amountOuts, routes, TradeType.EXACT_OUTPUT);
  }

  private async getQuotes(
    amounts: CurrencyAmount[],
    routes: QuickV2Route[],
    tradeType: TradeType
  ): Promise<{ routesWithQuotes: V2RouteWithQuotes[] }> {
    const routesWithQuotes: V2RouteWithQuotes[] = [];

    let debugStrs: string[] = [];
    for (const route of routes) {
      const amountQuotes: QuickV2AmountQuote[] = [];

      let insufficientInputAmountErrorCount = 0;
      let insufficientReservesErrorCount = 0;
      for (const amount of amounts) {
        try {
          if (tradeType == TradeType.EXACT_INPUT) {
            let outputAmount = wrappedAmount(amount, 137);

            for (const pair of route.pairs) {
              const [outputAmountNew] = pair.getOutputAmount(outputAmount);
              outputAmount = outputAmountNew;
            }

            amountQuotes.push({
              amount,
              quote: BigNumber.from(outputAmount.quotient.toString()),
            });
          } else {
            let inputAmount = wrappedAmount(amount, 137);

            for (let i = route.pairs.length - 1; i >= 0; i--) {
              const pair = route.pairs[i]!;
              [inputAmount] = pair.getInputAmount(inputAmount);
            }

            amountQuotes.push({
              amount,
              quote: BigNumber.from(inputAmount.quotient.toString()),
            });
          }
        } catch (err) {
          // Can fail to get quotes, e.g. throws InsufficientReservesError or InsufficientInputAmountError.
          if (err instanceof InsufficientInputAmountError) {
            insufficientInputAmountErrorCount =
              insufficientInputAmountErrorCount + 1;
            amountQuotes.push({ amount, quote: null });
          } else if (err instanceof InsufficientReservesError) {
            insufficientReservesErrorCount = insufficientReservesErrorCount + 1;
            amountQuotes.push({ amount, quote: null });
          } else {
            throw err;
          }
        }
      }

      if (
        insufficientInputAmountErrorCount > 0 ||
        insufficientReservesErrorCount > 0
      ) {
        debugStrs.push(
          `${[
            routeToString(route),
          ]} Input: ${insufficientInputAmountErrorCount} Reserves: ${insufficientReservesErrorCount} }`
        );
      }

      routesWithQuotes.push([route, amountQuotes]);
    }

    if (debugStrs.length > 0) {
      log.info({ debugStrs }, `Failed quotes for V2 routes`);
    }

    return {
      routesWithQuotes,
    };
  }
}
/**
 * Given a currency amount and a chain ID, returns the equivalent representation as the token amount.
 * In other words, if the currency is ETHER, returns the WETH token amount for the given chain. Otherwise, returns
 * the input currency amount.
 */
export function wrappedAmount(
  currencyAmount: CurrencyAmount,
  chainId: ChainId
): TokenAmount {
  if (currencyAmount instanceof TokenAmount) return currencyAmount;
  if (currencyAmount.currency === ETHER)
    return new TokenAmount(WETH[chainId], currencyAmount.raw);
  invariant(false, 'CURRENCY');
}

export function wrappedCurrency(currency: Currency, chainId: ChainId): Token {
  if (currency instanceof Token) return currency;
  if (currency === ETHER) return WETH[chainId];
  invariant(false, 'CURRENCY');
}
